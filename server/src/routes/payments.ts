import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { db } from '../db/database';
import {
  createPlatformPayment,
  calculateFees,
  isMollieConfigured,
} from '../services/mollieConnectService';
import {
  createPaymentRecord,
  getPaymentByMollieId,
  updatePaymentStatus,
  hasUserPurchasedTrip,
  fulfillPurchase,
  getCreatorEarnings,
  getTripSales,
} from '../services/paymentService';

const router = express.Router();

// ── Create payment for a trip ───────────────────────────────────────────────
router.post('/trips/:id/create-payment', authenticate, async (req: Request, res: Response) => {
  try {
    if (!isMollieConfigured()) {
      return res.status(503).json({ error: 'Mollie is not configured' });
    }

    const authReq = req as AuthRequest;
    const { id } = req.params;

    // Get published trip info
    const ep = db.prepare(`
      SELECT ep.trip_id, ep.price, ep.version, t.user_id as creator_id, t.title
      FROM explore_published ep
      JOIN trips t ON t.id = ep.trip_id
      WHERE ep.trip_id = ? AND ep.is_published = 1
    `).get(id) as { trip_id: number; price: number; version: number; creator_id: number; title: string } | undefined;

    if (!ep) return res.status(404).json({ error: 'Trip not found or not published' });
    if (ep.price === 0) return res.status(400).json({ error: 'Trip is free, no payment needed' });

    // Check if already purchased
    if (hasUserPurchasedTrip(authReq.user.id, Number(id))) {
      return res.status(409).json({ error: 'Already purchased', trip_id: id });
    }

    // Calculate fees (use creator-specific fee if set)
    const amountCents = ep.price * 100;
    const creatorFee = db.prepare('SELECT creator_fee_percent FROM users WHERE id = ?').get(ep.creator_id) as { creator_fee_percent: number | null } | undefined;
    const { platformFeeCents, creatorPayoutCents } = calculateFees(amountCents, creatorFee?.creator_fee_percent);

    // Create Mollie payment (platform receives all money)
    const redirectUrl = `${process.env.APP_URL || 'http://localhost:5173'}/explore?payment=processing&trip_id=${id}`;
    const payment = await createPlatformPayment(
      amountCents,
      `Trek: ${ep.title}`,
      redirectUrl,
      {
        user_id: String(authReq.user.id),
        trip_id: String(id),
        creator_id: String(ep.creator_id),
      }
    );

    // Save payment record
    createPaymentRecord({
      userId: authReq.user.id,
      sourceTripId: Number(id),
      creatorUserId: ep.creator_id,
      molliePaymentId: payment.id,
      amountCents,
      platformFeeCents,
      creatorPayoutCents,
    });

    res.json({ checkoutUrl: payment.getCheckoutUrl() });
  } catch (err: any) {
    console.error('Error creating payment:', err);
    res.status(500).json({ error: err.message || 'Failed to create payment' });
  }
});

// ── Get my payments / purchases ─────────────────────────────────────────────
router.get('/my', authenticate, (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const payments = db.prepare(`
      SELECT ep.*, t.title as trip_title
      FROM explore_payments ep
      JOIN trips t ON t.id = ep.source_trip_id
      WHERE ep.user_id = ?
      ORDER BY ep.created_at DESC
    `).all(authReq.user.id);
    res.json({ payments });
  } catch (err: any) {
    console.error('Error fetching payments:', err);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// ── Get my earnings (creator only) ──────────────────────────────────────────
router.get('/earnings', authenticate, (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (authReq.user.role !== 'creator' && authReq.user.role !== 'admin') {
      return res.status(403).json({ error: 'Creator access required' });
    }

    const earnings = getCreatorEarnings(authReq.user.id);

    // Per-trip breakdown
    const trips = db.prepare(`
      SELECT
        ep.source_trip_id,
        t.title,
        COUNT(*) as sales_count,
        COALESCE(SUM(ep.amount_cents), 0) as total_revenue,
        COALESCE(SUM(ep.creator_payout_cents), 0) as total_payout
      FROM explore_payments ep
      JOIN trips t ON t.id = ep.source_trip_id
      WHERE ep.creator_user_id = ? AND ep.status = 'paid'
      GROUP BY ep.source_trip_id
      ORDER BY total_revenue DESC
    `).all(authReq.user.id);

    res.json({ ...earnings, trips });
  } catch (err: any) {
    console.error('Error fetching earnings:', err);
    res.status(500).json({ error: 'Failed to fetch earnings' });
  }
});

// ── Get detailed earnings breakdown (per sale) ─────────────────────────────
router.get('/earnings/detailed', authenticate, (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (authReq.user.role !== 'creator' && authReq.user.role !== 'admin') {
      return res.status(403).json({ error: 'Creator access required' });
    }

    // All sales with breakdown
    const sales = db.prepare(`
      SELECT
        ep.id,
        ep.created_at,
        t.title as trip_title,
        u.username as buyer_name,
        ep.amount_cents,
        ep.platform_fee_cents,
        ep.creator_payout_cents,
        ep.currency,
        ep.status
      FROM explore_payments ep
      JOIN trips t ON t.id = ep.source_trip_id
      JOIN users u ON u.id = ep.user_id
      WHERE ep.creator_user_id = ?
      ORDER BY ep.created_at DESC
    `).all(authReq.user.id) as any[];

    // Per-trip summary with details
    const trips = db.prepare(`
      SELECT
        ep.source_trip_id,
        t.title,
        COUNT(*) as sales_count,
        COALESCE(SUM(ep.amount_cents), 0) as total_revenue,
        COALESCE(SUM(ep.platform_fee_cents), 0) as total_fees,
        COALESCE(SUM(ep.creator_payout_cents), 0) as total_payout,
        COALESCE(SUM(CASE WHEN ep.status = 'paid' THEN 1 ELSE 0 END), 0) as paid_count,
        COALESCE(SUM(CASE WHEN ep.status = 'pending' THEN 1 ELSE 0 END), 0) as pending_count
      FROM explore_payments ep
      JOIN trips t ON t.id = ep.source_trip_id
      WHERE ep.creator_user_id = ?
      GROUP BY ep.source_trip_id
      ORDER BY total_revenue DESC
    `).all(authReq.user.id) as any[];

    res.json({ sales, trips });
  } catch (err: any) {
    console.error('Error fetching detailed earnings:', err);
    res.status(500).json({ error: 'Failed to fetch detailed earnings' });
  }
});

export default router;
