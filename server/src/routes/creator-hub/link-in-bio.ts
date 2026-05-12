import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { db } from '../../db/database';

const router = Router();

// Public endpoint — no auth required (GET /:slug when mounted at /api/public/lib)
router.get('/:slug', (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    // Get creator by slug
    const creator = db
      .prepare('SELECT id, user_id FROM explore_creators WHERE slug = ?')
      .get(slug) as { id: number; user_id: number } | undefined;

    if (!creator) {
      return res.status(404).json({ error: 'Creator not found' });
    }

    // Get LiB config
    const config = db
      .prepare('SELECT * FROM creator_lib_config WHERE creator_id = ?')
      .get(creator.id);

    if (!config) {
      return res.status(404).json({ error: 'Link-in-Bio not found' });
    }

    // Get blocks
    const blocks = db
      .prepare('SELECT * FROM creator_lib_blocks WHERE creator_id = ? AND is_visible = 1 ORDER BY sort_order ASC')
      .all(creator.id);

    // Increment view count
    db.prepare('UPDATE creator_lib_config SET view_count = view_count + 1 WHERE creator_id = ?').run(creator.id);

    return res.json({ config, blocks });
  } catch (err) {
    console.error('[LiB] GET /public/:slug error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Creator routes require auth
router.use(authenticate);

// GET /config — haal LiB config op
router.get('/config', (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user || (user.role !== 'creator' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Not a creator' });
    }

    const creatorRow = db
      .prepare('SELECT id FROM explore_creators WHERE user_id = ?')
      .get(user.id) as { id: number } | undefined;

    if (!creatorRow) {
      return res.status(404).json({ error: 'Creator profile not found' });
    }

    const config = db
      .prepare('SELECT * FROM creator_lib_config WHERE creator_id = ?')
      .get(creatorRow.id);

    if (!config) {
      return res.status(404).json({ error: 'Link-in-Bio not yet configured' });
    }

    return res.json(config);
  } catch (err) {
    console.error('[LiB] GET /config error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /config — update config
router.patch('/config', (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user || (user.role !== 'creator' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Not a creator' });
    }

    const creatorRow = db
      .prepare('SELECT id FROM explore_creators WHERE user_id = ?')
      .get(user.id) as { id: number } | undefined;

    if (!creatorRow) {
      return res.status(404).json({ error: 'Creator profile not found' });
    }

    const { theme, custom_css, background_type, background_value, accent_color, font_family, tagline, show_country_count, show_location, show_listings, show_guides, show_group_trips, show_affiliate_links, show_tip_jar } = req.body;

    const stmt = db.prepare(`
      UPDATE creator_lib_config
      SET theme = COALESCE(?, theme),
          custom_css = COALESCE(?, custom_css),
          background_type = COALESCE(?, background_type),
          background_value = COALESCE(?, background_value),
          accent_color = COALESCE(?, accent_color),
          font_family = COALESCE(?, font_family),
          tagline = COALESCE(?, tagline),
          show_country_count = COALESCE(?, show_country_count),
          show_location = COALESCE(?, show_location),
          show_listings = COALESCE(?, show_listings),
          show_guides = COALESCE(?, show_guides),
          show_group_trips = COALESCE(?, show_group_trips),
          show_affiliate_links = COALESCE(?, show_affiliate_links),
          show_tip_jar = COALESCE(?, show_tip_jar),
          updated_at = CURRENT_TIMESTAMP
      WHERE creator_id = ?
    `);

    stmt.run(
      theme,
      custom_css,
      background_type,
      background_value,
      accent_color,
      font_family,
      tagline,
      show_country_count !== undefined ? (show_country_count ? 1 : 0) : null,
      show_location !== undefined ? (show_location ? 1 : 0) : null,
      show_listings !== undefined ? (show_listings ? 1 : 0) : null,
      show_guides !== undefined ? (show_guides ? 1 : 0) : null,
      show_group_trips !== undefined ? (show_group_trips ? 1 : 0) : null,
      show_affiliate_links !== undefined ? (show_affiliate_links ? 1 : 0) : null,
      show_tip_jar !== undefined ? (show_tip_jar ? 1 : 0) : null,
      creatorRow.id
    );

    const updated = db
      .prepare('SELECT * FROM creator_lib_config WHERE creator_id = ?')
      .get(creatorRow.id);

    return res.json(updated);
  } catch (err) {
    console.error('[LiB] PATCH /config error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /blocks — haal alle blocks op
router.get('/blocks', (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user || (user.role !== 'creator' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Not a creator' });
    }

    const creatorRow = db
      .prepare('SELECT id FROM explore_creators WHERE user_id = ?')
      .get(user.id) as { id: number } | undefined;

    if (!creatorRow) {
      return res.status(404).json({ error: 'Creator profile not found' });
    }

    const blocks = db
      .prepare('SELECT * FROM creator_lib_blocks WHERE creator_id = ? ORDER BY sort_order ASC')
      .all(creatorRow.id);

    return res.json(blocks);
  } catch (err) {
    console.error('[LiB] GET /blocks error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /blocks — maak nieuw block
router.post('/blocks', (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user || (user.role !== 'creator' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Not a creator' });
    }

    const creatorRow = db
      .prepare('SELECT id FROM explore_creators WHERE user_id = ?')
      .get(user.id) as { id: number } | undefined;

    if (!creatorRow) {
      return res.status(404).json({ error: 'Creator profile not found' });
    }

    const { type, title, url, icon, thumbnail_url, content } = req.body;

    // Get next sort_order
    const lastBlock = db
      .prepare('SELECT MAX(sort_order) as max_order FROM creator_lib_blocks WHERE creator_id = ?')
      .get(creatorRow.id) as { max_order: number | null };
    const sort_order = (lastBlock.max_order ?? -1) + 1;

    const id = Math.random().toString(36).substring(2, 10).toLowerCase();

    db.prepare(
      `INSERT INTO creator_lib_blocks (id, creator_id, type, title, url, icon, thumbnail_url, content, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, creatorRow.id, type, title, url, icon, thumbnail_url, JSON.stringify(content ?? {}), sort_order);

    const block = db.prepare('SELECT * FROM creator_lib_blocks WHERE id = ?').get(id);
    return res.status(201).json(block);
  } catch (err) {
    console.error('[LiB] POST /blocks error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /blocks/:blockId — update block
router.patch('/blocks/:blockId', (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user || (user.role !== 'creator' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Not a creator' });
    }

    const creatorRow = db
      .prepare('SELECT id FROM explore_creators WHERE user_id = ?')
      .get(user.id) as { id: number } | undefined;

    if (!creatorRow) {
      return res.status(404).json({ error: 'Creator profile not found' });
    }

    const { blockId } = req.params;
    const { title, url, icon, thumbnail_url, content, is_visible } = req.body;

    // Verify ownership
    const block = db.prepare('SELECT * FROM creator_lib_blocks WHERE id = ? AND creator_id = ?').get(blockId, creatorRow.id);
    if (!block) {
      return res.status(404).json({ error: 'Block not found' });
    }

    db.prepare(
      `UPDATE creator_lib_blocks
       SET title = COALESCE(?, title),
           url = COALESCE(?, url),
           icon = COALESCE(?, icon),
           thumbnail_url = COALESCE(?, thumbnail_url),
           content = COALESCE(?, content),
           is_visible = COALESCE(?, is_visible)
       WHERE id = ?`
    ).run(title, url, icon, thumbnail_url, content ? JSON.stringify(content) : null, is_visible !== undefined ? (is_visible ? 1 : 0) : null, blockId);

    const updated = db.prepare('SELECT * FROM creator_lib_blocks WHERE id = ?').get(blockId);
    return res.json(updated);
  } catch (err) {
    console.error('[LiB] PATCH /blocks/:blockId error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /blocks/:blockId — verwijder block
router.delete('/blocks/:blockId', (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user || (user.role !== 'creator' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Not a creator' });
    }

    const creatorRow = db
      .prepare('SELECT id FROM explore_creators WHERE user_id = ?')
      .get(user.id) as { id: number } | undefined;

    if (!creatorRow) {
      return res.status(404).json({ error: 'Creator profile not found' });
    }

    const { blockId } = req.params;

    // Verify ownership
    const block = db.prepare('SELECT * FROM creator_lib_blocks WHERE id = ? AND creator_id = ?').get(blockId, creatorRow.id);
    if (!block) {
      return res.status(404).json({ error: 'Block not found' });
    }

    db.prepare('DELETE FROM creator_lib_blocks WHERE id = ?').run(blockId);
    return res.json({ success: true });
  } catch (err) {
    console.error('[LiB] DELETE /blocks/:blockId error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /blocks/reorder — hersorteer blocks
router.patch('/blocks/reorder', (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user || (user.role !== 'creator' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Not a creator' });
    }

    const creatorRow = db
      .prepare('SELECT id FROM explore_creators WHERE user_id = ?')
      .get(user.id) as { id: number } | undefined;

    if (!creatorRow) {
      return res.status(404).json({ error: 'Creator profile not found' });
    }

    const { order } = req.body; // Array of {id, sort_order}
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'order must be an array' });
    }

    const updateStmt = db.prepare('UPDATE creator_lib_blocks SET sort_order = ? WHERE id = ? AND creator_id = ?');

    for (const item of order) {
      updateStmt.run(item.sort_order, item.id, creatorRow.id);
    }

    const blocks = db
      .prepare('SELECT * FROM creator_lib_blocks WHERE creator_id = ? ORDER BY sort_order ASC')
      .all(creatorRow.id);

    return res.json(blocks);
  } catch (err) {
    console.error('[LiB] PATCH /blocks/reorder error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
