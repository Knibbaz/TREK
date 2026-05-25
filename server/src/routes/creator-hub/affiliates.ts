import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { AuthRequest } from '../../types';
import { db } from '../../db/database';

const router = Router();

// Separate public router — only the redirect, no auth routes exposed
export const publicAffiliateRouter = Router();

function generateShortCode(): string {
  return Math.random().toString(36).substring(2, 10).toLowerCase();
}

function getDeviceType(ua: string): string {
  if (/mobile/i.test(ua)) return 'mobile';
  if (/tablet|ipad/i.test(ua)) return 'tablet';
  return 'desktop';
}

// Public redirect — mounted at /api/public/go/:slug/:code
publicAffiliateRouter.get('/:slug/:code', (req: Request, res: Response) => {
  try {
    const { slug, code } = req.params;

    const creator = db
      .prepare('SELECT id FROM explore_creators WHERE slug = ?')
      .get(slug) as { id: number } | undefined;

    if (!creator) return res.status(404).json({ error: 'Creator not found' });

    const link = db
      .prepare('SELECT * FROM creator_affiliate_links WHERE creator_id = ? AND short_code = ? AND is_active = 1')
      .get(creator.id, code) as { id: string; destination_url: string } | undefined;

    if (!link) return res.status(404).json({ error: 'Link not found' });

    // Async click logging — don't block redirect
    setImmediate(() => {
      try {
        const referrer = (req.headers['referer'] || req.headers['referrer'] || null) as string | null;
        const ua = req.headers['user-agent'] || '';
        const device_type = getDeviceType(ua);
        const source = (req.query.source as string) || 'direct';

        const clickId = Math.random().toString(36).substring(2, 18);
        db.prepare(
          'INSERT INTO creator_affiliate_clicks (id, link_id, referrer, device_type, source) VALUES (?, ?, ?, ?, ?)'
        ).run(clickId, link.id, referrer, device_type, source);

        db.prepare('UPDATE creator_affiliate_links SET click_count = click_count + 1 WHERE id = ?').run(link.id);
      } catch (e) {
        console.error('[affiliates] Click log error:', e);
      }
    });

    return res.redirect(302, link.destination_url);
  } catch (err) {
    console.error('[affiliates] GET /go/:slug/:code error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// All creator routes require auth
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

// GET /affiliates — list all links for creator
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const creator = requireCreator(req, res);
    if (!creator) return;

    const links = db
      .prepare('SELECT * FROM creator_affiliate_links WHERE creator_id = ? ORDER BY created_at DESC')
      .all(creator.id);

    return res.json(links);
  } catch (err) {
    console.error('[affiliates] GET / error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /affiliates/stats — aggregated stats
router.get('/stats', (req: AuthRequest, res: Response) => {
  try {
    const creator = requireCreator(req, res);
    if (!creator) return;

    const totals = db
      .prepare('SELECT COUNT(*) as total_links, SUM(click_count) as total_clicks FROM creator_affiliate_links WHERE creator_id = ?')
      .get(creator.id) as { total_links: number; total_clicks: number };

    const byCategory = db
      .prepare('SELECT category, COUNT(*) as count, SUM(click_count) as clicks FROM creator_affiliate_links WHERE creator_id = ? GROUP BY category')
      .all(creator.id);

    const topLinks = db
      .prepare('SELECT id, title, short_code, click_count, category FROM creator_affiliate_links WHERE creator_id = ? ORDER BY click_count DESC LIMIT 5')
      .all(creator.id);

    return res.json({ totals, byCategory, topLinks });
  } catch (err) {
    console.error('[affiliates] GET /stats error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /affiliates — create link
router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const creator = requireCreator(req, res);
    if (!creator) return;

    const { title, destination_url, category, icon, description, linked_listing_id, linked_guide_id, network, estimated_commission_rate } = req.body;

    if (!title || !destination_url) {
      return res.status(400).json({ error: 'title and destination_url are required' });
    }

    // Generate unique short_code
    let short_code = generateShortCode();
    let attempts = 0;
    while (db.prepare('SELECT id FROM creator_affiliate_links WHERE short_code = ?').get(short_code) && attempts < 10) {
      short_code = generateShortCode();
      attempts++;
    }

    const id = Math.random().toString(36).substring(2, 18);

    db.prepare(
      `INSERT INTO creator_affiliate_links
       (id, creator_id, title, destination_url, short_code, category, icon, description, linked_listing_id, linked_guide_id, network, estimated_commission_rate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, creator.id, title, destination_url, short_code, category || null, icon || null, description || null, linked_listing_id || null, linked_guide_id || null, network || null, estimated_commission_rate || null);

    const link = db.prepare('SELECT * FROM creator_affiliate_links WHERE id = ?').get(id);
    return res.status(201).json(link);
  } catch (err) {
    console.error('[affiliates] POST / error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /affiliates/:id — update link
router.patch('/:id', (req: AuthRequest, res: Response) => {
  try {
    const creator = requireCreator(req, res);
    if (!creator) return;

    const link = db
      .prepare('SELECT id FROM creator_affiliate_links WHERE id = ? AND creator_id = ?')
      .get(req.params.id, creator.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });

    const { title, destination_url, category, icon, description, network, estimated_commission_rate, is_active } = req.body;

    db.prepare(
      `UPDATE creator_affiliate_links
       SET title = COALESCE(?, title),
           destination_url = COALESCE(?, destination_url),
           category = COALESCE(?, category),
           icon = COALESCE(?, icon),
           description = COALESCE(?, description),
           network = COALESCE(?, network),
           estimated_commission_rate = COALESCE(?, estimated_commission_rate),
           is_active = COALESCE(?, is_active)
       WHERE id = ?`
    ).run(title, destination_url, category, icon, description, network, estimated_commission_rate, is_active !== undefined ? (is_active ? 1 : 0) : null, req.params.id);

    const updated = db.prepare('SELECT * FROM creator_affiliate_links WHERE id = ?').get(req.params.id);
    return res.json(updated);
  } catch (err) {
    console.error('[affiliates] PATCH /:id error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /affiliates/:id — delete link
router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const creator = requireCreator(req, res);
    if (!creator) return;

    const link = db
      .prepare('SELECT id FROM creator_affiliate_links WHERE id = ? AND creator_id = ?')
      .get(req.params.id, creator.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });

    db.prepare('DELETE FROM creator_affiliate_links WHERE id = ?').run(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    console.error('[affiliates] DELETE /:id error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
