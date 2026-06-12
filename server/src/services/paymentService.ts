import { db } from '../db/database';
import { copyTripTransaction } from './tripCopyService';

export interface PaymentRecord {
  id: number;
  user_id: number;
  source_trip_id: number;
  creator_user_id: number;
  mollie_payment_id: string;
  amount_cents: number;
  platform_fee_cents: number;
  creator_payout_cents: number;
  currency: string;
  status: string;
  paid_at: string | null;
  created_at: string;
}

export function createPaymentRecord(data: {
  userId: number;
  sourceTripId: number;
  creatorUserId: number;
  molliePaymentId: string;
  amountCents: number;
  platformFeeCents: number;
  creatorPayoutCents: number;
}): PaymentRecord {
  const result = db.prepare(`
    INSERT INTO explore_payments (
      user_id, source_trip_id, creator_user_id, mollie_payment_id,
      amount_cents, platform_fee_cents, creator_payout_cents, currency, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'EUR', 'pending')
  `).run(
    data.userId,
    data.sourceTripId,
    data.creatorUserId,
    data.molliePaymentId,
    data.amountCents,
    data.platformFeeCents,
    data.creatorPayoutCents
  );

  return db.prepare('SELECT * FROM explore_payments WHERE id = ?').get(result.lastInsertRowid) as PaymentRecord;
}

export function updatePaymentStatus(molliePaymentId: string, status: string, paidAt?: string): void {
  db.prepare(`
    UPDATE explore_payments SET
      status = ?,
      paid_at = COALESCE(?, paid_at),
      updated_at = datetime('now')
    WHERE mollie_payment_id = ?
  `).run(status, paidAt || null, molliePaymentId);
}

export function hasUserPurchasedTrip(userId: number, sourceTripId: number): boolean {
  const row = db.prepare('SELECT 1 FROM explore_user_trips WHERE user_id = ? AND source_trip_id = ?').get(userId, sourceTripId);
  return !!row;
}

export function getPaymentRecordByMollieId(molliePaymentId: string): PaymentRecord | undefined {
  return db.prepare('SELECT * FROM explore_payments WHERE mollie_payment_id = ?').get(molliePaymentId) as PaymentRecord | undefined;
}

/**
 * Fulfill a paid purchase by copying the trip to the buyer's account.
 * Idempotent: safe to call multiple times for the same payment.
 */
export function fulfillPurchase(paymentRecord: PaymentRecord): { tripId: number; alreadyFulfilled: boolean } {
  // Check if already fulfilled
  const existing = db.prepare('SELECT trip_id FROM explore_user_trips WHERE user_id = ? AND source_trip_id = ?')
    .get(paymentRecord.user_id, paymentRecord.source_trip_id) as { trip_id: number } | undefined;

  if (existing) {
    return { tripId: existing.trip_id, alreadyFulfilled: true };
  }

  // Get original trip title
  const trip = db.prepare('SELECT title FROM trips WHERE id = ?').get(paymentRecord.source_trip_id) as { title: string } | undefined;
  const title = trip?.title || 'Explore Trip';

  // Copy trip
  const newTripId = copyTripTransaction(db, paymentRecord.source_trip_id, paymentRecord.user_id, title);

  // Track purchase
  db.prepare(`
    INSERT INTO explore_user_trips (user_id, trip_id, source_trip_id, snapshot_version, payment_id)
    VALUES (?, ?, ?, (SELECT COALESCE(version, 1) FROM explore_published WHERE trip_id = ?), ?)
  `).run(paymentRecord.user_id, newTripId, paymentRecord.source_trip_id, paymentRecord.source_trip_id, paymentRecord.id);

  // Increment purchase count (best effort)
  try {
    db.prepare('UPDATE explore_published SET purchase_count = COALESCE(purchase_count, 0) + 1 WHERE trip_id = ?')
      .run(paymentRecord.source_trip_id);
  } catch { /* column may not exist yet */ }

  return { tripId: Number(newTripId), alreadyFulfilled: false };
}

export function getCreatorEarnings(creatorUserId: number): {
  totalSales: number;
  totalFees: number;
  totalPayout: number;
  salesCount: number;
} {
  const result = db.prepare(`
    SELECT
      COALESCE(SUM(amount_cents), 0) as total_sales,
      COALESCE(SUM(platform_fee_cents), 0) as total_fees,
      COALESCE(SUM(creator_payout_cents), 0) as total_payout,
      COUNT(*) as sales_count
    FROM explore_payments
    WHERE creator_user_id = ? AND status = 'paid'
  `).get(creatorUserId) as {
    total_sales: number;
    total_fees: number;
    total_payout: number;
    sales_count: number;
  };

  return {
    totalSales: result.total_sales,
    totalFees: result.total_fees,
    totalPayout: result.total_payout,
    salesCount: result.sales_count,
  };
}

export function getTripSales(sourceTripId: number): {
  salesCount: number;
  totalRevenue: number;
} {
  const result = db.prepare(`
    SELECT
      COUNT(*) as sales_count,
      COALESCE(SUM(amount_cents), 0) as total_revenue
    FROM explore_payments
    WHERE source_trip_id = ? AND status = 'paid'
  `).get(sourceTripId) as { sales_count: number; total_revenue: number };

  return {
    salesCount: result.sales_count,
    totalRevenue: result.total_revenue,
  };
}
