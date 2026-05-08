import createMollieClient, { Payment } from '@mollie/api-client';
import { db } from '../db/database';
import {
  MOLLIE_API_KEY,
  PLATFORM_FEE_PERCENT,
  APP_URL,
} from '../config';

// Check if in dev/localhost mode
const isDevMode = process.env.NODE_ENV === 'development' || APP_URL.includes('localhost');

// Lazily initialized Mollie client
let _mollieClient: ReturnType<typeof createMollieClient> | null = null;
function getMollieClient() {
  if (!_mollieClient) {
    if (!MOLLIE_API_KEY) throw new Error('MOLLIE_API_KEY is not configured');
    _mollieClient = createMollieClient({ apiKey: MOLLIE_API_KEY });
  }
  return _mollieClient;
}

// ── Standard Payment (platform receives all money) ──────────────────────────

export async function createPlatformPayment(
  amountCents: number,
  description: string,
  redirectUrl: string,
  metadata: Record<string, string>
): Promise<Payment> {
  // Dev mode: return mock payment instead of calling Mollie
  if (isDevMode) {
    console.warn('[Mollie] Dev mode: returning mock payment (webhook URL unreachable from localhost)');
    const mockPayment = {
      id: `tr_DEV_${Date.now()}`,
      mode: 'test',
      createdAt: new Date(),
      status: 'open',
      isCancellable: true,
      isPaid: false,
      isRefundable: false,
      amount: {
        currency: 'EUR',
        value: (amountCents / 100).toFixed(2),
      },
      description,
      redirectUrl,
      webhookUrl: `${APP_URL}/webhooks/mollie`,
      metadata,
      links: {
        checkout: { href: redirectUrl },
      },
      getCheckoutUrl: () => redirectUrl,
    } as any as Payment;
    return mockPayment;
  }

  const payment = await getMollieClient().payments.create({
    amount: {
      currency: 'EUR',
      value: (amountCents / 100).toFixed(2),
    },
    description,
    redirectUrl,
    webhookUrl: `${APP_URL}/webhooks/mollie`,
    metadata,
  });

  return payment;
}

// ── Webhook Handling ────────────────────────────────────────────────────────

export async function getPaymentFromMollie(molliePaymentId: string): Promise<Payment> {
  // Dev mode: return mock paid payment
  if (isDevMode) {
    console.warn('[Mollie] Dev mode: returning mock paid payment for', molliePaymentId);
    const mockPayment = {
      id: molliePaymentId,
      mode: 'test',
      createdAt: new Date(),
      status: 'paid',
      isPaid: true,
      isCancellable: false,
      isRefundable: true,
      amount: { currency: 'EUR', value: '10.00' },
      description: 'Dev mock payment',
      redirectUrl: APP_URL,
      webhookUrl: `${APP_URL}/webhooks/mollie`,
      metadata: {},
      getCheckoutUrl: () => APP_URL,
    } as any as Payment;
    return mockPayment;
  }

  return await getMollieClient().payments.get(molliePaymentId);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function getPlatformFeePercent(): number {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'platform_fee_percent'").get() as { value: string } | undefined;
    if (row) return parseInt(row.value, 10);
  } catch { /* fallback to env */ }
  return PLATFORM_FEE_PERCENT;
}

export function calculateFees(amountCents: number, creatorFeePercent?: number | null): { platformFeeCents: number; creatorPayoutCents: number } {
  const feePercent = creatorFeePercent ?? getPlatformFeePercent();
  const platformFeeCents = Math.round((amountCents * feePercent) / 100);
  const creatorPayoutCents = amountCents - platformFeeCents;
  return { platformFeeCents, creatorPayoutCents };
}

export function isMollieConfigured(): boolean {
  return !!MOLLIE_API_KEY;
}
