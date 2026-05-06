import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { db } from '../db/database';
import { copyTripTransaction, mergeTripFromSource } from '../services/tripCopyService';
import { getPlatformFeePercent } from '../services/mollieConnectService';

const router = express.Router();
router.use(authenticate);

interface ExploreTrip {
  id: number
  title: string
  description: string
  cover_url: string | null
  start_date: string
  end_date: string
  price: number
  duration_days: number
  places_count: number
  owner_name: string
  version: number
  descriptions: string // JSON string
  community_enabled: number
  listing_title?: string
  tagline?: string
  tags?: string // JSON string
  destination?: string
  country_code?: string
  difficulty?: string
  best_season?: string // JSON string
  display_title?: string
  avg_rating?: number
  rating_count?: number
  view_count?: number
}

function isAdmin(userId: number): boolean {
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
  return user?.role === 'admin';
}

function getUser(userId: number): { role: string; creator_auto_approved: number } | undefined {
  return db.prepare('SELECT role, creator_auto_approved FROM users WHERE id = ?').get(userId) as { role: string; creator_auto_approved: number } | undefined;
}

// ── Get explore configuration ──────────────────────────────────────────────
router.get('/config', (req: Request, res: Response) => {
  try {
    const commissionPct = getPlatformFeePercent();
    res.json({ commission_percentage: commissionPct });
  } catch (err: unknown) {
    console.error('Error fetching explore config:', err);
    res.status(500).json({ error: 'Failed to fetch explore config' });
  }
});

// ── List published explore trips ───────────────────────────────────────────
router.get('/trips', (req: Request, res: Response) => {
  try {
    const filter = req.query.filter as string | undefined; // 'all' | 'curated' | 'community'
    const q = req.query.q as string | undefined;
    const minPrice = req.query.minPrice as string | undefined;
    const maxPrice = req.query.maxPrice as string | undefined;
    const destination = req.query.destination as string | undefined;
    const difficulty = req.query.difficulty as string | undefined;
    const tag = req.query.tag as string | undefined;
    const sort = req.query.sort as string | undefined; // 'newest' | 'popular' | 'rating' | 'price_asc' | 'price_desc'
    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string || '20', 10)));
    const offset = (page - 1) * limit;

    let whereClause = 'ep.trip_id IS NOT NULL AND ep.is_published = 1';
    const params: (string | number)[] = [];

    if (filter === 'curated') whereClause += ' AND COALESCE(ep.community_enabled, 0) = 0';
    if (filter === 'community') whereClause += ' AND COALESCE(ep.community_enabled, 0) = 1';

    // Full-text search on title, description, destination, tags
    if (q && q.trim()) {
      const searchTerm = `%${q.trim().toLowerCase()}%`;
      whereClause += ` AND (
        LOWER(COALESCE(ep.listing_title, t.title)) LIKE ?
        OR LOWER(t.description) LIKE ?
        OR LOWER(COALESCE(ep.destination, '')) LIKE ?
        OR LOWER(COALESCE(ep.tagline, '')) LIKE ?
        OR LOWER(COALESCE(ep.tags, '')) LIKE ?
      )`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (minPrice !== undefined) {
      whereClause += ' AND COALESCE(ep.price, 0) >= ?';
      params.push(Number(minPrice));
    }
    if (maxPrice !== undefined) {
      whereClause += ' AND COALESCE(ep.price, 0) <= ?';
      params.push(Number(maxPrice));
    }
    if (destination && destination.trim()) {
      whereClause += " AND LOWER(COALESCE(ep.destination, '')) LIKE ?";
      params.push(`%${destination.trim().toLowerCase()}%`);
    }
    if (difficulty && difficulty.trim()) {
      whereClause += " AND COALESCE(ep.difficulty, 'easy') = ?";
      params.push(difficulty.trim().toLowerCase());
    }
    if (tag && tag.trim()) {
      whereClause += " AND LOWER(COALESCE(ep.tags, '')) LIKE ?";
      params.push(`%"${tag.trim().toLowerCase()}"%`);
    }

    // Count total for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM trips t
      LEFT JOIN explore_published ep ON t.id = ep.trip_id
      WHERE ${whereClause}
    `;
    const countResult = db.prepare(countQuery).get(...params) as { total: number } | undefined;
    const total = countResult?.total || 0;

    // Sorting
    let orderClause = 'ORDER BY ep.created_at DESC';
    switch (sort) {
      case 'popular':
        orderClause = 'ORDER BY COALESCE(ep.view_count, 0) DESC, ep.created_at DESC';
        break;
      case 'rating':
        orderClause = 'ORDER BY COALESCE(ep.avg_rating, 0) DESC, ep.created_at DESC';
        break;
      case 'price_asc':
        orderClause = 'ORDER BY COALESCE(ep.price, 0) ASC, ep.created_at DESC';
        break;
      case 'price_desc':
        orderClause = 'ORDER BY COALESCE(ep.price, 0) DESC, ep.created_at DESC';
        break;
      case 'newest':
      default:
        orderClause = 'ORDER BY ep.created_at DESC';
        break;
    }

    const publishedTrips = db.prepare(`
      SELECT
        t.id,
        t.title,
        t.description,
        t.cover_image as cover_url,
        t.start_date,
        t.end_date,
        COALESCE(ep.price, 0) as price,
        COALESCE((SELECT COUNT(*) FROM days WHERE trip_id = t.id), 0) as duration_days,
        COALESCE((SELECT COUNT(*) FROM places WHERE trip_id = t.id AND (source IS NULL OR source = 'admin')), 0) as places_count,
        u.username as owner_name,
        COALESCE(ep.version, 1) as version,
        COALESCE(ep.descriptions, '{}') as descriptions,
        COALESCE(ep.community_enabled, 0) as community_enabled,
        ep.listing_title,
        ep.tagline,
        COALESCE(ep.tags, '[]') as tags,
        ep.destination,
        ep.country_code,
        COALESCE(ep.difficulty, 'easy') as difficulty,
        COALESCE(ep.best_season, '[]') as best_season,
        COALESCE(ep.listing_title, t.title) as display_title,
        COALESCE(ep.avg_rating, 0) as avg_rating,
        COALESCE(ep.rating_count, 0) as rating_count,
        COALESCE(ep.view_count, 0) as view_count
      FROM trips t
      LEFT JOIN explore_published ep ON t.id = ep.trip_id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as ExploreTrip[];

    res.json({ trips: publishedTrips || [], total, page, limit });
  } catch (err: unknown) {
    console.error('Error fetching explore trips:', err);
    res.status(500).json({ error: 'Failed to fetch explore trips' });
  }
});

// ── Get single explore trip detail ─────────────────────────────────────────
router.get('/trips/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const trip = db.prepare(`
      SELECT
        t.id,
        t.title,
        t.description,
        t.cover_image as cover_url,
        t.start_date,
        t.end_date,
        COALESCE(ep.price, 0) as price,
        COALESCE((SELECT COUNT(*) FROM days WHERE trip_id = t.id), 0) as duration_days,
        COALESCE((SELECT COUNT(*) FROM places WHERE trip_id = t.id AND (source IS NULL OR source = 'admin')), 0) as places_count,
        u.username as owner_name,
        COALESCE(ep.version, 1) as version,
        COALESCE(ep.descriptions, '{}') as descriptions,
        COALESCE(ep.community_enabled, 0) as community_enabled,
        COALESCE((SELECT COUNT(*) FROM places WHERE trip_id = t.id AND source = 'community'), 0) as community_places_count,
        ep.listing_title,
        ep.tagline,
        COALESCE(ep.tags, '[]') as tags,
        ep.destination,
        ep.country_code,
        COALESCE(ep.difficulty, 'easy') as difficulty,
        COALESCE(ep.best_season, '[]') as best_season,
        COALESCE(ep.listing_title, t.title) as display_title,
        COALESCE(ep.avg_rating, 0) as avg_rating,
        COALESCE(ep.rating_count, 0) as rating_count,
        COALESCE(ep.view_count, 0) as view_count
      FROM trips t
      LEFT JOIN explore_published ep ON t.id = ep.trip_id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = ? AND ep.trip_id IS NOT NULL AND ep.is_published = 1
    `).get(id) as ExploreTrip | undefined;

    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    // Increment view count (best effort)
    try {
      db.prepare('UPDATE explore_published SET view_count = COALESCE(view_count, 0) + 1 WHERE trip_id = ?').run(id);
    } catch { /* column may not exist yet */ }

    // Days with notes
    const days = db.prepare(`
      SELECT d.id, d.day_number, d.title, d.date, d.notes
      FROM days d WHERE d.trip_id = ? ORDER BY d.day_number ASC
    `).all(id) as Array<{ id: number; day_number: number; title: string | null; date: string | null; notes: string | null }>;

    // Assigned places with price, reservation info, coordinates, and category
    const places = db.prepare(`
      SELECT
        p.id, p.name, p.description, p.image_url,
        p.price, p.currency, p.lat, p.lng,
        da.day_id, da.order_index, da.reservation_status,
        c.name as category_name, c.color as category_color, c.icon as category_icon
      FROM places p
      JOIN day_assignments da ON da.place_id = p.id
      JOIN days d ON d.id = da.day_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE d.trip_id = ? AND (p.source IS NULL OR p.source = 'admin')
      ORDER BY da.day_id, da.order_index ASC
    `).all(id) as any[];

    // Build category statistics
    const categoryStats: Record<string, { name: string; color: string; icon: string; count: number }> = {};
    for (const place of places) {
      const catName = place.category_name || 'Overig';
      if (!categoryStats[catName]) {
        categoryStats[catName] = {
          name: catName,
          color: place.category_color || '#6366f1',
          icon: place.category_icon || '📍',
          count: 0,
        };
      }
      categoryStats[catName].count++;
    }
    const categoryStatsArray = Object.values(categoryStats).sort((a, b) => b.count - a.count);

    // Blur coordinates for preview (apply ~500m random offset)
    const BLUR_OFFSET = 0.0045; // ~500m in degrees
    function blurCoordinate(val: number | null): number | null {
      if (val == null) return null;
      const offset = (Math.random() - 0.5) * 2 * BLUR_OFFSET;
      return Number((val + offset).toFixed(6));
    }

    // Pick first 3 places as "highlights" (unblurred), rest is blurred
    const highlightIds = new Set(places.slice(0, 3).map((p: any) => p.id));
    const blurredPlaces = places.map((place: any) => ({
      ...place,
      lat: highlightIds.has(place.id) ? place.lat : blurCoordinate(place.lat),
      lng: highlightIds.has(place.id) ? place.lng : blurCoordinate(place.lng),
      is_highlight: highlightIds.has(place.id),
    }));

    const placesByDay: Record<number, typeof blurredPlaces> = {};
    for (const place of blurredPlaces) {
      if (!placesByDay[place.day_id]) placesByDay[place.day_id] = [];
      placesByDay[place.day_id].push(place);
    }

    const daysWithPlaces = days.map(day => {
      const dayPlaces = placesByDay[day.id] || [];
      return {
        ...day,
        places: dayPlaces,
        budget_estimate: dayPlaces.reduce((sum: number, p: any) => sum + (p.price || 0), 0),
        bookings_needed: dayPlaces.filter((p: any) => p.reservation_status && p.reservation_status !== 'none').length,
      };
    });

    // Check if current user already owns this trip
    const authReq = req as AuthRequest;
    const userOwns = db.prepare('SELECT trip_id FROM explore_user_trips WHERE user_id = ? AND source_trip_id = ?')
      .get(authReq.user.id, id) as { trip_id: number } | undefined;

    res.json({
      trip,
      days: daysWithPlaces,
      category_stats: categoryStatsArray,
      total_budget_estimate: places.reduce((sum: number, p: any) => sum + (p.price || 0), 0),
      already_purchased: !!userOwns,
      user_trip_id: userOwns?.trip_id || null,
    });
  } catch (err: unknown) {
    console.error('Error fetching explore trip:', err);
    res.status(500).json({ error: 'Failed to fetch explore trip' });
  }
});

// ── Publish trip to Explore (admin, first time) ────────────────────────────
router.post('/trips/:id/publish', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!isAdmin(authReq.user.id)) return res.status(403).json({ error: 'Only admins can publish trips' });

    const { id } = req.params;
    const { price, descriptions, community_enabled } = req.body;

    const trip = db.prepare('SELECT id FROM trips WHERE id = ?').get(id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const descriptionsJson = descriptions ? JSON.stringify(descriptions) : '{}';
    const communityFlag = community_enabled ? 1 : 0;

    db.prepare(`
      INSERT INTO explore_published (trip_id, price, is_published, version, descriptions, community_enabled, last_published_at, created_at, updated_at)
      VALUES (?, ?, 1, 1, ?, ?, datetime('now'), datetime('now'), datetime('now'))
      ON CONFLICT(trip_id) DO UPDATE SET
        is_published = 1,
        price = excluded.price,
        descriptions = excluded.descriptions,
        community_enabled = excluded.community_enabled,
        updated_at = datetime('now')
    `).run(id, price || 0, descriptionsJson, communityFlag);

    res.json({ success: true, message: 'Trip published to Explore' });
  } catch (err: unknown) {
    console.error('Error publishing trip:', err);
    res.status(500).json({ error: 'Failed to publish trip' });
  }
});

// ── Publish update (admin) — bumps version + notifies all owners ───────────
router.post('/trips/:id/publish-update', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!isAdmin(authReq.user.id)) return res.status(403).json({ error: 'Only admins can publish updates' });

    const { id } = req.params;
    const { descriptions } = req.body;

    const ep = db.prepare('SELECT trip_id, version FROM explore_published WHERE trip_id = ? AND is_published = 1').get(id) as
      { trip_id: number; version: number } | undefined;
    if (!ep) return res.status(404).json({ error: 'Trip not published' });

    const newVersion = (ep.version || 1) + 1;
    const descriptionsJson = descriptions ? JSON.stringify(descriptions) : undefined;

    db.prepare(`
      UPDATE explore_published SET
        version = ?,
        last_published_at = datetime('now'),
        updated_at = datetime('now')
        ${descriptionsJson ? ', descriptions = ?' : ''}
      WHERE trip_id = ?
    `).run(...(descriptionsJson ? [newVersion, descriptionsJson, id] : [newVersion, id]));

    // Find all user trips that are behind on version
    const staleUserTrips = db.prepare(`
      SELECT eut.user_id, eut.trip_id, t.title
      FROM explore_user_trips eut
      JOIN trips t ON t.id = eut.trip_id
      WHERE eut.source_trip_id = ? AND eut.snapshot_version < ?
    `).all(id, newVersion) as Array<{ user_id: number; trip_id: number; title: string }>;

    const sourceTitle = (db.prepare('SELECT title FROM trips WHERE id = ?').get(id) as { title: string } | undefined)?.title || '';

    // Fire-and-forget notifications
    if (staleUserTrips.length > 0) {
      import('../services/notificationService').then(({ send }) => {
        for (const ut of staleUserTrips) {
          send({
            event: 'explore_update',
            actorId: authReq.user.id,
            scope: 'user',
            targetId: ut.user_id,
            params: { trip: sourceTitle, tripId: String(ut.trip_id) },
          }).catch(() => {});
        }
      });
    }

    res.json({ success: true, version: newVersion, notified_count: staleUserTrips.length });
  } catch (err: unknown) {
    console.error('Error publishing update:', err);
    res.status(500).json({ error: 'Failed to publish update' });
  }
});

// ── Unpublish (admin) ──────────────────────────────────────────────────────
router.post('/trips/:id/unpublish', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!isAdmin(authReq.user.id)) return res.status(403).json({ error: 'Only admins can unpublish trips' });

    db.prepare('DELETE FROM explore_published WHERE trip_id = ?').run(req.params.id);
    res.json({ success: true, message: 'Trip unpublished from Explore' });
  } catch (err: unknown) {
    console.error('Error unpublishing trip:', err);
    res.status(500).json({ error: 'Failed to unpublish trip' });
  }
});

// ── Purchase — full copy + track in explore_user_trips ────────────────────
router.post('/trips/:id/purchase', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const { title } = req.body;

    const ep = db.prepare('SELECT trip_id, price, version FROM explore_published WHERE trip_id = ? AND is_published = 1').get(id) as
      { trip_id: number; price: number; version: number } | undefined;
    if (!ep) return res.status(404).json({ error: 'Trip not found or not published' });

    // Paid trips must go through the payment flow
    if (ep.price > 0) {
      return res.status(400).json({ error: 'Payment required', code: 'PAYMENT_REQUIRED', trip_id: id });
    }

    // Check if user already owns a copy
    const existing = db.prepare('SELECT trip_id FROM explore_user_trips WHERE user_id = ? AND source_trip_id = ?')
      .get(authReq.user.id, id) as { trip_id: number } | undefined;
    if (existing) {
      return res.status(409).json({ error: 'Already owned', trip_id: existing.trip_id });
    }

    const newTripId = copyTripTransaction(db, Number(id), authReq.user.id, title);

    db.prepare(`
      INSERT INTO explore_user_trips (user_id, trip_id, source_trip_id, snapshot_version)
      VALUES (?, ?, ?, ?)
    `).run(authReq.user.id, newTripId, id, ep.version || 1);

    // Track free purchase in payments table so it shows up in creator earnings/sales
    try {
      const sourceTrip = db.prepare('SELECT user_id FROM trips WHERE id = ?').get(id) as { user_id: number } | undefined;
      if (sourceTrip) {
        db.prepare(`
          INSERT INTO explore_payments (user_id, source_trip_id, creator_user_id, mollie_payment_id, amount_cents, platform_fee_cents, creator_payout_cents, currency, status, paid_at)
          VALUES (?, ?, ?, 'FREE', 0, 0, 0, 'EUR', 'paid', datetime('now'))
        `).run(authReq.user.id, id, sourceTrip.user_id);
      }
    } catch (err) {
      console.error('[explore] Failed to track free payment:', err);
    }

    // Increment purchase count (best effort)
    try {
      db.prepare('UPDATE explore_published SET purchase_count = COALESCE(purchase_count, 0) + 1 WHERE trip_id = ?')
        .run(id);
    } catch { /* column may not exist yet */ }

    res.json({ success: true, trip_id: Number(newTripId), message: 'Trip added to your trips' });
  } catch (err: unknown) {
    console.error('Error purchasing trip:', err);
    res.status(500).json({ error: 'Failed to purchase trip' });
  }
});

// ── Sync — auto-merge new content from source into user trip ──────────────
router.post('/trips/:id/sync', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params; // user's trip_id

    const link = db.prepare(`
      SELECT eut.id, eut.source_trip_id, eut.snapshot_version, ep.version as current_version
      FROM explore_user_trips eut
      JOIN explore_published ep ON ep.trip_id = eut.source_trip_id
      WHERE eut.trip_id = ? AND eut.user_id = ?
    `).get(id, authReq.user.id) as { id: number; source_trip_id: number; snapshot_version: number; current_version: number } | undefined;

    if (!link) return res.status(404).json({ error: 'No linked source trip found' });

    if (link.snapshot_version >= link.current_version) {
      return res.json({ success: true, message: 'Already up to date', added_days: 0, added_places: 0 });
    }

    const result = mergeTripFromSource(db, link.source_trip_id, Number(id));

    db.prepare('UPDATE explore_user_trips SET snapshot_version = ? WHERE id = ?')
      .run(link.current_version, link.id);

    res.json({ success: true, ...result, version: link.current_version });
  } catch (err: unknown) {
    console.error('Error syncing trip:', err);
    res.status(500).json({ error: 'Failed to sync trip' });
  }
});

// ── Sync status ────────────────────────────────────────────────────────────
router.get('/trips/:id/sync-status', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params; // user's trip_id

    const link = db.prepare(`
      SELECT eut.snapshot_version, ep.version as current_version, eut.source_trip_id,
             COALESCE(ep.community_enabled, 0) as community_enabled
      FROM explore_user_trips eut
      JOIN explore_published ep ON ep.trip_id = eut.source_trip_id
      WHERE eut.trip_id = ? AND eut.user_id = ?
    `).get(id, authReq.user.id) as { snapshot_version: number; current_version: number; source_trip_id: number; community_enabled: number } | undefined;

    if (!link) return res.json({ linked: false });

    res.json({
      linked: true,
      snapshot_version: link.snapshot_version,
      current_version: link.current_version,
      update_available: link.snapshot_version < link.current_version,
      source_trip_id: link.source_trip_id,
      community_enabled: link.community_enabled === 1,
    });
  } catch (err: unknown) {
    console.error('Error fetching sync status:', err);
    res.status(500).json({ error: 'Failed to fetch sync status' });
  }
});

// ── Community places — list ────────────────────────────────────────────────
router.get('/trips/:sourceTripId/community-places', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { sourceTripId } = req.params;

    // Must be admin OR have purchased this trip
    const hasAccess = isAdmin(authReq.user.id) ||
      db.prepare('SELECT 1 FROM explore_user_trips WHERE source_trip_id = ? AND user_id = ?')
        .get(sourceTripId, authReq.user.id);
    if (!hasAccess) return res.status(403).json({ error: 'No access to community places' });

    const places = db.prepare(`
      SELECT p.id, p.name, p.description, p.lat, p.lng, p.address,
             p.category_id, p.price, p.currency, p.image_url, p.website,
             p.notes, p.contributed_by, p.created_at,
             c.name as category_name, c.color as category_color, c.icon as category_icon,
             u.username as contributed_by_name
      FROM places p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN users u ON u.id = p.contributed_by
      WHERE p.trip_id = ? AND p.source = 'community'
      ORDER BY p.created_at DESC
    `).all(sourceTripId) as any[];

    res.json({ places });
  } catch (err: unknown) {
    console.error('Error fetching community places:', err);
    res.status(500).json({ error: 'Failed to fetch community places' });
  }
});

// ── Community places — contribute ──────────────────────────────────────────
router.post('/trips/:sourceTripId/community-places', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { sourceTripId } = req.params;

    // Verify community is enabled for this trip
    const ep = db.prepare('SELECT community_enabled FROM explore_published WHERE trip_id = ? AND is_published = 1')
      .get(sourceTripId) as { community_enabled: number } | undefined;
    if (!ep) return res.status(404).json({ error: 'Trip not published' });
    if (!ep.community_enabled) return res.status(403).json({ error: 'Community contributions not enabled for this trip' });

    // Verify user has purchased this trip
    const link = db.prepare('SELECT 1 FROM explore_user_trips WHERE source_trip_id = ? AND user_id = ?')
      .get(sourceTripId, authReq.user.id);
    if (!link && !isAdmin(authReq.user.id)) return res.status(403).json({ error: 'You must own a copy of this trip to contribute' });

    const { name, description, lat, lng, address, category_id, price, currency, image_url, website, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = db.prepare(`
      INSERT INTO places (trip_id, name, description, lat, lng, address, category_id, price, currency,
        image_url, website, notes, source, contributed_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'community', ?)
    `).run(sourceTripId, name, description || null, lat || null, lng || null, address || null,
        category_id || null, price || null, currency || null, image_url || null, website || null,
        notes || null, authReq.user.id);

    const place = db.prepare(`
      SELECT p.*, c.name as category_name, c.color as category_color, c.icon as category_icon,
             u.username as contributed_by_name
      FROM places p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN users u ON u.id = p.contributed_by
      WHERE p.id = ?
    `).get(result.lastInsertRowid) as any;

    res.status(201).json({ place });
  } catch (err: unknown) {
    console.error('Error contributing community place:', err);
    res.status(500).json({ error: 'Failed to contribute community place' });
  }
});

// ── Creator: submit trip for Explore ──────────────────────────────────────
router.post('/trips/:id/submit', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const { price, descriptions, community_enabled, listing_title, tagline, tags, destination, country_code, difficulty, best_season } = req.body;

    const actor = getUser(authReq.user.id);
    if (!actor || (actor.role !== 'creator' && actor.role !== 'admin')) {
      return res.status(403).json({ error: 'Only creators can submit trips for Explore' });
    }

    const trip = db.prepare('SELECT id, user_id FROM trips WHERE id = ?').get(id) as { id: number; user_id: number } | undefined;
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.user_id !== authReq.user.id && !isAdmin(authReq.user.id)) {
      return res.status(403).json({ error: 'You can only submit your own trips' });
    }

    const existing = db.prepare('SELECT id, status FROM explore_published WHERE trip_id = ?').get(id) as { id: number; status: string } | undefined;
    if (existing && (existing.status === 'approved' || existing.status === 'pending')) {
      return res.status(409).json({ error: existing.status === 'approved' ? 'Trip is already published' : 'Trip already has a pending submission' });
    }

    const descriptionsJson = descriptions ? JSON.stringify(descriptions) : '{}';
    const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : '[]';
    const bestSeasonJson = Array.isArray(best_season) ? JSON.stringify(best_season) : '[]';
    const communityFlag = community_enabled ? 1 : 0;
    const autoApproved = actor.creator_auto_approved === 1 || isAdmin(authReq.user.id);
    const status = autoApproved ? 'approved' : 'pending';
    const isPublished = autoApproved ? 1 : 0;

    db.prepare(`
      INSERT INTO explore_published (trip_id, price, is_published, version, descriptions, community_enabled, status, submitted_by, last_published_at, listing_title, tagline, tags, destination, country_code, difficulty, best_season, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?, ?, ?, ${autoApproved ? "datetime('now')" : 'NULL'}, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(trip_id) DO UPDATE SET
        price = excluded.price,
        is_published = excluded.is_published,
        descriptions = excluded.descriptions,
        community_enabled = excluded.community_enabled,
        status = excluded.status,
        submitted_by = excluded.submitted_by,
        last_published_at = excluded.last_published_at,
        listing_title = excluded.listing_title,
        tagline = excluded.tagline,
        tags = excluded.tags,
        destination = excluded.destination,
        country_code = excluded.country_code,
        difficulty = excluded.difficulty,
        best_season = excluded.best_season,
        updated_at = datetime('now')
    `).run(id, price || 0, isPublished, descriptionsJson, communityFlag, status, authReq.user.id, listing_title || null, tagline || null, tagsJson, destination || null, country_code || null, difficulty || 'easy', bestSeasonJson);

    res.json({ success: true, status, auto_approved: autoApproved });
  } catch (err: unknown) {
    console.error('Error submitting trip:', err);
    res.status(500).json({ error: 'Failed to submit trip' });
  }
});

// ── Creator: get own submissions ───────────────────────────────────────────
router.get('/my-submissions', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;

    const submissions = db.prepare(`
      SELECT ep.id, ep.trip_id, ep.status, ep.price, ep.is_published, ep.version,
             ep.community_enabled, ep.submitted_by, ep.created_at, ep.updated_at,
             t.title, t.description, t.cover_image, t.start_date, t.end_date
      FROM explore_published ep
      JOIN trips t ON t.id = ep.trip_id
      WHERE ep.submitted_by = ?
      ORDER BY ep.updated_at DESC
    `).all(authReq.user.id) as any[];

    res.json({ submissions });
  } catch (err: unknown) {
    console.error('Error fetching submissions:', err);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// ── Creator: withdraw pending submission ───────────────────────────────────
router.delete('/submissions/:id', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;

    const submission = db.prepare('SELECT id, submitted_by, status FROM explore_published WHERE id = ?').get(id) as { id: number; submitted_by: number | null; status: string } | undefined;
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    if (submission.submitted_by !== authReq.user.id && !isAdmin(authReq.user.id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (submission.status !== 'pending' && !isAdmin(authReq.user.id)) {
      return res.status(400).json({ error: 'Only pending submissions can be withdrawn' });
    }

    db.prepare('DELETE FROM explore_published WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err: unknown) {
    console.error('Error withdrawing submission:', err);
    res.status(500).json({ error: 'Failed to withdraw submission' });
  }
});

// ── Admin: list all submissions (pending / approved / rejected) ────────────
router.get('/submissions', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!isAdmin(authReq.user.id)) return res.status(403).json({ error: 'Admin only' });

    const status = req.query.status as string | undefined; // 'pending' | 'approved' | 'rejected' | undefined = all
    const whereClause = status ? 'WHERE ep.status = ?' : "WHERE ep.submitted_by IS NOT NULL";

    const submissions = db.prepare(`
      SELECT ep.id, ep.trip_id, ep.status, ep.price, ep.is_published, ep.version,
             ep.descriptions, ep.community_enabled, ep.submitted_by, ep.created_at, ep.updated_at,
             t.title, t.description, t.cover_image, t.start_date, t.end_date,
             u.username as submitter_name, u.email as submitter_email,
             u.creator_auto_approved,
             COALESCE((SELECT COUNT(*) FROM days WHERE trip_id = t.id), 0) as day_count,
             COALESCE((SELECT COUNT(*) FROM places WHERE trip_id = t.id), 0) as place_count
      FROM explore_published ep
      JOIN trips t ON t.id = ep.trip_id
      JOIN users u ON u.id = ep.submitted_by
      ${whereClause}
      ORDER BY ep.created_at DESC
    `).all(...(status ? [status] : [])) as any[];

    res.json({ submissions });
  } catch (err: unknown) {
    console.error('Error fetching submissions:', err);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// ── Admin: approve submission ──────────────────────────────────────────────
router.post('/submissions/:id/approve', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!isAdmin(authReq.user.id)) return res.status(403).json({ error: 'Admin only' });

    const { id } = req.params;
    const { auto_approve, price, descriptions, community_enabled } = req.body;

    const submission = db.prepare('SELECT id, trip_id, submitted_by FROM explore_published WHERE id = ? AND status = ?').get(id, 'pending') as { id: number; trip_id: number; submitted_by: number } | undefined;
    if (!submission) return res.status(404).json({ error: 'Pending submission not found' });

    const updates: string[] = ['is_published = 1', "status = 'approved'", "last_published_at = datetime('now')", "updated_at = datetime('now')"];
    const params: (string | number)[] = [];

    if (price !== undefined) { updates.push('price = ?'); params.push(price); }
    if (descriptions !== undefined) { updates.push('descriptions = ?'); params.push(JSON.stringify(descriptions)); }
    if (community_enabled !== undefined) { updates.push('community_enabled = ?'); params.push(community_enabled ? 1 : 0); }

    db.prepare(`UPDATE explore_published SET ${updates.join(', ')} WHERE id = ?`).run(...params, id);

    if (auto_approve && submission.submitted_by) {
      db.prepare('UPDATE users SET creator_auto_approved = 1 WHERE id = ?').run(submission.submitted_by);
    }

    res.json({ success: true });
  } catch (err: unknown) {
    console.error('Error approving submission:', err);
    res.status(500).json({ error: 'Failed to approve submission' });
  }
});

// ── Admin: reject submission ───────────────────────────────────────────────
router.post('/submissions/:id/reject', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!isAdmin(authReq.user.id)) return res.status(403).json({ error: 'Admin only' });

    const { id } = req.params;
    const { notes } = req.body;

    const submission = db.prepare('SELECT id FROM explore_published WHERE id = ? AND status = ?').get(id, 'pending') as { id: number } | undefined;
    if (!submission) return res.status(404).json({ error: 'Pending submission not found' });

    db.prepare("UPDATE explore_published SET status = 'rejected', is_published = 0, moderation_notes = ?, updated_at = datetime('now') WHERE id = ?").run(notes || null, id);
    res.json({ success: true });
  } catch (err: unknown) {
    console.error('Error rejecting submission:', err);
    res.status(500).json({ error: 'Failed to reject submission' });
  }
});

// ── Community places — delete ──────────────────────────────────────────────
router.delete('/trips/:sourceTripId/community-places/:placeId', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { sourceTripId, placeId } = req.params;

    const place = db.prepare(
      "SELECT id, contributed_by FROM places WHERE id = ? AND trip_id = ? AND source = 'community'"
    ).get(placeId, sourceTripId) as { id: number; contributed_by: number | null } | undefined;
    if (!place) return res.status(404).json({ error: 'Community place not found' });

    // Only the contributor or an admin can delete
    if (place.contributed_by !== authReq.user.id && !isAdmin(authReq.user.id)) {
      return res.status(403).json({ error: 'Not authorized to delete this community place' });
    }

    db.prepare('DELETE FROM places WHERE id = ?').run(placeId);
    res.json({ success: true });
  } catch (err: unknown) {
    console.error('Error deleting community place:', err);
    res.status(500).json({ error: 'Failed to delete community place' });
  }
});

export default router;
