import { Router, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { AuthRequest } from '../../types';
import { db } from '../../db/database';

const router = Router();

router.use(authenticate);

function requireCreator(req: AuthRequest, res: Response): { id: number } | null {
  const user = req.user;
  if (!user || (user.role !== 'creator' && user.role !== 'admin')) {
    res.status(403).json({ error: 'Not a creator' });
    return null;
  }
  const row = db
    .prepare('SELECT id FROM explore_creators WHERE user_id = ?')
    .get(user.id) as { id: number } | undefined;
  if (!row) {
    res.status(404).json({ error: 'Creator profile not found' });
    return null;
  }
  return row;
}

// GET /tips — list tips received by creator
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const creator = requireCreator(req, res);
    if (!creator) return;

    const tips = db
      .prepare('SELECT * FROM creator_tips WHERE creator_id = ? ORDER BY created_at DESC LIMIT 100')
      .all(creator.id);

    const totals = db
      .prepare('SELECT COUNT(*) as count, SUM(amount_cents) as total_cents FROM creator_tips WHERE creator_id = ? AND status = ?')
      .get(creator.id, 'completed') as { count: number; total_cents: number | null };

    return res.json({ tips, totals });
  } catch (err) {
    console.error('[tips] GET / error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
