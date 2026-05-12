import express, { Request, Response } from 'express';
import { authenticate, adminOnly } from '../middleware/auth';
import { db } from '../db/database';

const router = express.Router();

router.use(authenticate, adminOnly);

/**
 * GET /api/admin/gdpr/exports
 * List all GDPR export requests with user info
 */
router.get('/exports', (req: Request, res: Response) => {
  try {
    const exports = db.prepare(`
      SELECT
        g.id,
        g.user_id,
        u.username,
        u.email,
        g.status,
        g.download_count,
        g.max_downloads,
        g.requested_at,
        g.ready_at,
        g.expires_at,
        g.file_size_bytes
      FROM gdpr_export_requests g
      LEFT JOIN users u ON g.user_id = u.id
      ORDER BY g.requested_at DESC
    `).all() as Array<Record<string, unknown>>;

    res.json({ success: true, exports });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to fetch GDPR exports', detail: msg });
  }
});

/**
 * GET /api/admin/gdpr/deletions
 * List pending account deletions
 */
router.get('/deletions', (req: Request, res: Response) => {
  try {
    const deletions = db.prepare(`
      SELECT
        id,
        username,
        email,
        deletion_requested_at,
        pending_deletion,
        (
          SELECT datetime(datetime(deletion_requested_at, '+14 days'))
        ) as delete_at
      FROM users
      WHERE pending_deletion = 1
      ORDER BY deletion_requested_at DESC
    `).all() as Array<Record<string, unknown>>;

    res.json({
      success: true,
      pending_count: deletions.length,
      deletions,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to fetch pending deletions', detail: msg });
  }
});

export default router;
