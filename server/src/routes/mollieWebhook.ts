import express, { Request, Response } from 'express';
import { getPaymentFromMollie } from '../services/mollieConnectService';
import {
  getPaymentByMollieId,
  updatePaymentStatus,
  fulfillPurchase,
} from '../services/paymentService';

const router = express.Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing payment id' });
    }

    // Always acknowledge webhook quickly
    res.status(200).send('OK');

    // Fetch payment from Mollie to verify status
    const payment = await getPaymentFromMollie(id);
    const record = getPaymentByMollieId(id);
    if (!record) {
      console.warn(`[Mollie Webhook] Payment ${id} not found in local DB`);
      return;
    }

    if (payment.status === 'paid') {
      // Avoid double-fulfillment
      if (record.status === 'paid') {
        console.log(`[Mollie Webhook] Payment ${id} already fulfilled`);
        return;
      }

      updatePaymentStatus(id, 'paid', payment.paidAt);

      try {
        const { tripId, alreadyFulfilled } = fulfillPurchase(record);
        console.log(`[Mollie Webhook] Payment ${id} fulfilled → trip ${tripId} (alreadyFulfilled=${alreadyFulfilled})`);
      } catch (fulfillErr: any) {
        console.error(`[Mollie Webhook] Failed to fulfill payment ${id}:`, fulfillErr);
      }
    } else if (['failed', 'cancelled', 'expired'].includes(payment.status || '')) {
      updatePaymentStatus(id, payment.status || 'failed');
      console.log(`[Mollie Webhook] Payment ${id} marked as ${payment.status}`);
    }
  } catch (err: any) {
    console.error('[Mollie Webhook] Error:', err);
    // Already responded 200 above; log only
  }
});

export default router;
