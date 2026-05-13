import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { writeAudit, getClientIp } from '../services/auditLog';
import { requestDeletion, cancelDeletion } from '../services/gdprService';
import { db } from '../db/database';
import { AuthRequest } from '../types';

const router = express.Router();

/**
 * POST /api/user/delete-account
 * Initiate account deletion with 14-day grace period
 */
router.post('/delete-account', authenticate, (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user.id;

    // Check: not demo mode
    if (process.env.DEMO_MODE?.toLowerCase() === 'true') {
      return res.status(403).json({ error: 'Cannot delete accounts in demo mode' });
    }

    // Check: not last admin
    const adminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ? AND id != ?').get('admin', userId) as { count: number };
    if (authReq.user.role === 'admin' && adminCount.count === 0) {
      return res.status(403).json({ error: 'Cannot delete the last admin account' });
    }

    // Request deletion
    requestDeletion(userId, authReq.user.email);

    // Audit log
    writeAudit({
      userId,
      action: 'gdpr.deletion_requested',
      ip: getClientIp(req),
    });

    // Calculate grace period end date
    const deleteAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    res.json({
      success: true,
      grace_period_days: 14,
      delete_at: deleteAt.toISOString(),
      message: 'Account deletion initiated. You have 14 days to cancel.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to initiate account deletion', detail: msg });
  }
});

/**
 * POST /api/user/cancel-deletion
 * Cancel pending account deletion within grace period
 */
router.post('/cancel-deletion', authenticate, (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user.id;

    // Check: account is pending deletion
    const user = db.prepare('SELECT pending_deletion FROM users WHERE id = ?').get(userId) as { pending_deletion: number } | undefined;
    if (!user || !user.pending_deletion) {
      return res.status(400).json({ error: 'Account deletion is not pending' });
    }

    // Cancel deletion
    cancelDeletion(userId);

    // Audit log
    writeAudit({
      userId,
      action: 'gdpr.deletion_cancelled',
      ip: getClientIp(req),
    });

    res.json({
      success: true,
      message: 'Account deletion has been cancelled. Your account is safe.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to cancel deletion', detail: msg });
  }
});

export default router;
