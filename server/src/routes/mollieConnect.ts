import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { isMollieConfigured } from '../services/mollieConnectService';

const router = express.Router();

// ── Get Mollie configuration status ─────────────────────────────────────────
router.get('/status', authenticate, (_req: Request, res: Response) => {
  res.json({
    connected: isMollieConfigured(),
    profileId: null,
  });
});

export default router;
