import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { db } from '../db/database';
import { copyTripTransaction, mergeTripFromSource } from '../services/tripCopyService';

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
}

function isAdmin(userId: number): boolean {
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
  return user?.role === 'admin';
}

// ── List published explore trips ───────────────────────────────────────────
router.get('/trips', (req: Request, res: Response) => {
  try {
    const filter = req.query.filter as string | undefined; // 'all' | 'curated' | 'community'
    let whereClause = 'ep.trip_id IS NOT NULL AND ep.is_published = 1';
    if (filter === 'curated') whereClause += ' AND COALESCE(ep.community_enabled, 0) = 0';
    if (filter === 'community') whereClause += ' AND COALESCE(ep.community_enabled, 0) = 1';

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
        COALESCE(ep.community_enabled, 0) as community_enabled
      FROM trips t
      LEFT JOIN explore_published ep ON t.id = ep.trip_id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE ${whereClause}
      ORDER BY ep.created_at DESC
    `).all() as ExploreTrip[];

    res.json({ trips: publishedTrips || [] });
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
        COALESCE((SELECT COUNT(*) FROM places WHERE trip_id = t.id AND source = 'community'), 0) as community_places_count
      FROM trips t
      LEFT JOIN explore_published ep ON t.id = ep.trip_id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = ? AND ep.trip_id IS NOT NULL AND ep.is_published = 1
    `).get(id) as ExploreTrip | undefined;

    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    // Days with notes
    const days = db.prepare(`
      SELECT d.id, d.day_number, d.title, d.date, d.notes
      FROM days d WHERE d.trip_id = ? ORDER BY d.day_number ASC
    `).all(id) as Array<{ id: number; day_number: number; title: string | null; date: string | null; notes: string | null }>;

    // Assigned places with price and reservation info
    const places = db.prepare(`
      SELECT
        p.id, p.name, p.description, p.image_url,
        p.price, p.currency,
        da.day_id, da.order_index, da.reservation_status,
        c.name as category_name, c.color as category_color
      FROM places p
      JOIN day_assignments da ON da.place_id = p.id
      JOIN days d ON d.id = da.day_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE d.trip_id = ?
      ORDER BY da.day_id, da.order_index ASC
    `).all(id) as any[];

    const placesByDay: Record<number, typeof places> = {};
    for (const place of places) {
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

    res.json({ trip, days: daysWithPlaces });
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

    const ep = db.prepare('SELECT trip_id, version FROM explore_published WHERE trip_id = ? AND is_published = 1').get(id) as
      { trip_id: number; version: number } | undefined;
    if (!ep) return res.status(404).json({ error: 'Trip not found or not published' });

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
