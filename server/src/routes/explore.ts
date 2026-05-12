import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { db } from '../db/database';
import { copyTripTransaction, mergeTripFromSource } from '../services/tripCopyService';
import { getPlatformFeePercent } from '../services/mollieConnectService';
import { getDeltas, getDeltaSummary, getConflictingEntities, clearDeltas } from '../services/deltaTrackingService';
import { getCreatorBadges, BADGES, recalculateCreatorBadges } from '../services/badgeService';

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
const DEFAULT_MOLLIE_METHODS = [
  { name: 'iDEAL', fixed_cents: 29, variable_pct: 1.8 },
  { name: 'Credit card', fixed_cents: 29, variable_pct: 2.34 },
];

router.get('/config', (req: Request, res: Response) => {
  try {
    const commissionPct = getPlatformFeePercent();
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'mollie_payment_methods'").get() as { value: string } | undefined;
    const mollieMethods = row ? JSON.parse(row.value) : DEFAULT_MOLLIE_METHODS;
    res.json({ commission_percentage: commissionPct, mollie_methods: mollieMethods });
  } catch (err: unknown) {
    console.error('Error fetching explore config:', err);
    res.status(500).json({ error: 'Failed to fetch explore config' });
  }
});

// ── Creator profile endpoints ──────────────────────────────────────────────

// Apply to become a creator
router.post('/creators/apply', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { display_name, slug, bio, avatar, social_links } = req.body;
    if (!display_name || !slug) {
      return res.status(400).json({ error: 'display_name and slug are required' });
    }

    // Check if user already has a creator profile
    const existing = db.prepare('SELECT id FROM explore_creators WHERE user_id = ?').get(userId);
    if (existing) {
      return res.status(400).json({ error: 'You already have a creator profile' });
    }

    // Check slug availability
    const slugExists = db.prepare('SELECT id FROM explore_creators WHERE slug = ?').get(slug);
    if (slugExists) {
      return res.status(400).json({ error: 'Slug already taken' });
    }

    // Create creator profile
    const result = db.prepare(`
      INSERT INTO explore_creators (user_id, slug, display_name, bio, avatar, social_links, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
    `).run(userId, slug, display_name, bio || null, avatar || null, JSON.stringify(social_links || {}));

    // Send admin notification
    const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all() as { id: number }[];
    for (const admin of admins) {
      db.prepare(`
        INSERT INTO notifications (user_id, type, title, message, data, created_at, is_read)
        VALUES (?, 'creator_application', 'New Creator Application', ?, ?, datetime('now'), 0)
      `).run(admin.id, `${display_name} applied to become a creator`, JSON.stringify({ creator_id: result.lastInsertRowid, user_id: userId }));
    }

    res.json({ id: result.lastInsertRowid, slug, display_name });
  } catch (err: unknown) {
    console.error('Error applying for creator:', err);
    res.status(500).json({ error: 'Failed to apply for creator status' });
  }
});

// Get own creator profile
router.get('/creators/me', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const creator = db.prepare(`
      SELECT * FROM explore_creators WHERE user_id = ?
    `).get(userId);

    if (!creator) {
      return res.status(404).json({ error: 'No creator profile found' });
    }

    const badges = getCreatorBadges(db, userId);
    const badgeDetails = badges.map(b => BADGES[b]);

    res.json({ ...creator, badges: badgeDetails });
  } catch (err: unknown) {
    console.error('Error fetching creator profile:', err);
    res.status(500).json({ error: 'Failed to fetch creator profile' });
  }
});

// ── Update creator profile (customization) ────────────────────────────────
router.patch('/creators/me', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { display_name, bio, avatar_url, cover_image_url, social_links, tagline } = req.body;

    const creator = db.prepare('SELECT id FROM explore_creators WHERE user_id = ?').get(userId) as { id: number } | undefined;
    if (!creator) return res.status(404).json({ error: 'No creator profile found' });

    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (display_name !== undefined) {
      updates.push('display_name = ?');
      params.push(display_name);
    }
    if (bio !== undefined) {
      updates.push('bio = ?');
      params.push(bio);
    }
    if (avatar_url !== undefined) {
      updates.push('avatar = ?');
      params.push(avatar_url);
    }
    if (cover_image_url !== undefined) {
      try {
        db.prepare('ALTER TABLE explore_creators ADD COLUMN cover_image_url TEXT');
      } catch (err: any) {
        if (!err.message?.includes('duplicate column name')) throw err;
      }
      updates.push('cover_image_url = ?');
      params.push(cover_image_url);
    }
    if (social_links !== undefined) {
      updates.push('social_links = ?');
      params.push(JSON.stringify(social_links));
    }
    if (tagline !== undefined) {
      try {
        db.prepare('ALTER TABLE explore_creators ADD COLUMN tagline TEXT');
      } catch (err: any) {
        if (!err.message?.includes('duplicate column name')) throw err;
      }
      updates.push('tagline = ?');
      params.push(tagline);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(userId);
    updates.push('updated_at = datetime(\'now\')');

    const updateQuery = `UPDATE explore_creators SET ${updates.join(', ')} WHERE user_id = ?`;
    db.prepare(updateQuery).run(...params);

    // Fetch updated creator
    const updated = db.prepare('SELECT * FROM explore_creators WHERE user_id = ?').get(userId);
    const badges = getCreatorBadges(db, userId);
    const badgeDetails = badges.map(b => BADGES[b]);

    res.json({ ...updated, badges: badgeDetails });
  } catch (err: unknown) {
    console.error('Error updating creator profile:', err);
    res.status(500).json({ error: 'Failed to update creator profile' });
  }
});

// ── Creator earnings dashboard ────────────────────────────────────────────
router.get('/creators/me/earnings', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const earnings = getCreatorEarnings(userId);

    // Get earnings per listing
    const perListing = db.prepare(`
      SELECT
        ep.trip_id,
        ep.listing_title,
        COUNT(ep2.trip_id) as sales_count,
        COALESCE(SUM(eep.amount_cents), 0) as total_gross,
        COALESCE(SUM(eep.platform_fee_cents), 0) as total_fees,
        COALESCE(SUM(eep.creator_payout_cents), 0) as total_net
      FROM explore_published ep
      LEFT JOIN explore_payments eep ON eep.source_trip_id = ep.trip_id AND eep.status = 'paid'
      LEFT JOIN explore_published ep2 ON ep2.trip_id = eep.source_trip_id
      WHERE ep.submitted_by = ? AND ep.is_published = 1
      GROUP BY ep.trip_id
      ORDER BY total_net DESC
    `).all(userId) as any[];

    res.json({
      earnings,
      per_listing: perListing.map(p => ({
        trip_id: p.trip_id,
        listing_title: p.listing_title,
        sales_count: p.sales_count || 0,
        total_gross_cents: p.total_gross || 0,
        total_fees_cents: p.total_fees || 0,
        total_net_cents: p.total_net || 0,
      })),
    });
  } catch (err: unknown) {
    console.error('Error fetching creator earnings:', err);
    res.status(500).json({ error: 'Failed to fetch earnings' });
  }
});

// ── Creator payout history ────────────────────────────────────────────────
router.get('/creators/me/payouts', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const payouts = db.prepare(`
      SELECT * FROM creator_payouts
      WHERE creator_user_id = (SELECT id FROM explore_creators WHERE user_id = ?)
      ORDER BY created_at DESC
    `).all(userId) as any[];

    res.json({ payouts });
  } catch (err: unknown) {
    console.error('Error fetching creator payouts:', err);
    res.status(500).json({ error: 'Failed to fetch payouts' });
  }
});

// Check slug availability
router.get('/creators/check-slug/:slug', (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const exists = db.prepare('SELECT id FROM explore_creators WHERE slug = ?').get(slug);
    res.json({ available: !exists });
  } catch (err: unknown) {
    console.error('Error checking slug:', err);
    res.status(500).json({ error: 'Failed to check slug availability' });
  }
});

// Get badges for a creator
router.get('/creators/:slug/badges', (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const creator = db.prepare('SELECT user_id FROM explore_creators WHERE slug = ? AND status = ?')
      .get(slug, 'approved') as { user_id: number } | undefined;

    if (!creator) return res.status(404).json({ error: 'Creator not found' });

    const badges = getCreatorBadges(db, creator.user_id);
    const badgeDetails = badges.map(b => BADGES[b]);

    res.json({ badges: badgeDetails });
  } catch (err: unknown) {
    console.error('Error fetching creator badges:', err);
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
});

// ── Get public creator storefront ──────────────────────────────────────────────
router.get('/creators/:slug', (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const creator = db.prepare(`
      SELECT ec.slug, ec.display_name, ec.bio, ec.avatar, ec.social_links,
             u.id as user_id
      FROM explore_creators ec
      JOIN users u ON u.id = ec.user_id
      WHERE ec.slug = ? AND ec.status = 'approved' AND ec.is_suspended = 0
    `).get(slug) as any;

    if (!creator) return res.status(404).json({ error: 'Creator not found' });

    const listings = db.prepare(`
      SELECT ep.trip_id, ep.listing_title, ep.tagline, ep.tags, ep.destination,
             ep.difficulty, ep.price, ep.view_count, ep.purchase_count,
             ep.avg_rating, ep.rating_count, ep.is_featured,
             t.cover_image, t.start_date, t.end_date,
             (SELECT COUNT(*) FROM days WHERE trip_id = t.id) as day_count,
             (SELECT COUNT(*) FROM places WHERE trip_id = t.id) as place_count
      FROM explore_published ep
      JOIN trips t ON t.id = ep.trip_id
      WHERE t.user_id = ? AND ep.is_published = 1 AND ep.is_suspended = 0
      ORDER BY ep.is_featured DESC, ep.updated_at DESC
    `).all(creator.user_id) as any[];

    const stats = {
      listing_count: listings.length,
      total_sales: listings.reduce((s: number, l: any) => s + (l.purchase_count || 0), 0),
      avg_rating: listings.length
        ? Number((listings.reduce((s: number, l: any) => s + (l.avg_rating || 0), 0) / listings.length).toFixed(1))
        : 0,
    };

    const badges = getCreatorBadges(db, creator.user_id);
    const badgeDetails = badges.map(b => BADGES[b]);

    res.json({
      creator: {
        slug: creator.slug,
        display_name: creator.display_name,
        bio: creator.bio,
        avatar: creator.avatar,
        social_links: JSON.parse(creator.social_links || '{}'),
        badges: badgeDetails,
      },
      listings,
      stats,
    });
  } catch (err: unknown) {
    console.error('Error fetching creator storefront:', err);
    res.status(500).json({ error: 'Failed to fetch creator' });
  }
});

// Get featured listings
router.get('/trips/featured', (req: Request, res: Response) => {
  try {
    const limit = Math.min(10, Math.max(1, parseInt(req.query.limit as string || '6', 10)));

    const featured = db.prepare(`
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
      WHERE ep.trip_id IS NOT NULL AND ep.is_published = 1 AND COALESCE(ep.is_featured, 0) = 1 AND COALESCE(ep.is_suspended, 0) = 0
      ORDER BY ep.updated_at DESC
      LIMIT ?
    `).all(limit) as any[];

    res.json({ featured: featured || [] });
  } catch (err: unknown) {
    console.error('Error fetching featured listings:', err);
    res.status(500).json({ error: 'Failed to fetch featured listings' });
  }
});

// List published explore trips ───────────────────────────────────────────
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

    let whereClause = 'ep.trip_id IS NOT NULL AND ep.is_published = 1 AND COALESCE(ep.is_suspended, 0) = 0';
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
        t.user_id,
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
      WHERE t.id = ? AND ep.trip_id IS NOT NULL AND ep.is_published = 1 AND COALESCE(ep.is_suspended, 0) = 0
    `).get(id) as (ExploreTrip & { user_id: number }) | undefined;

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
      is_own_trip: trip.user_id === authReq.user.id,
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

    // Check if creator is trying to purchase their own trip
    const sourceTrip = db.prepare('SELECT user_id FROM trips WHERE id = ?').get(id) as { user_id: number } | undefined;
    if (sourceTrip?.user_id === authReq.user.id) {
      return res.status(403).json({ error: 'Cannot purchase your own trip', code: 'OWN_TRIP' });
    }

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

    // Clear deltas after successful sync (user's local changes are now rebased)
    clearDeltas(db, link.id);

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

// ── Get fork deltas (user's local changes) ─────────────────────────────────
router.get('/fork-deltas/:userTripId', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { userTripId } = req.params;

    // Verify user owns this fork
    const userTrip = db.prepare('SELECT id, user_id FROM explore_user_trips WHERE id = ?').get(userTripId) as { id: number; user_id: number } | undefined;
    if (!userTrip || (userTrip.user_id !== authReq.user.id && !isAdmin(authReq.user.id))) {
      return res.status(403).json({ error: 'Not authorized to view deltas for this fork' });
    }

    const deltas = getDeltas(db, parseInt(userTripId));
    const summary = getDeltaSummary(db, parseInt(userTripId));

    res.json({ deltas, summary });
  } catch (err: unknown) {
    console.error('Error fetching fork deltas:', err);
    res.status(500).json({ error: 'Failed to fetch fork deltas' });
  }
});

// ── Get delta summary (counts by action) ────────────────────────────────────
router.get('/fork-deltas/:userTripId/summary', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { userTripId } = req.params;

    // Verify user owns this fork
    const userTrip = db.prepare('SELECT id, user_id FROM explore_user_trips WHERE id = ?').get(userTripId) as { id: number; user_id: number } | undefined;
    if (!userTrip || (userTrip.user_id !== authReq.user.id && !isAdmin(authReq.user.id))) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const summary = getDeltaSummary(db, parseInt(userTripId));
    res.json(summary);
  } catch (err: unknown) {
    console.error('Error fetching delta summary:', err);
    res.status(500).json({ error: 'Failed to fetch delta summary' });
  }
});

// ── Get sync preview with conflicts ────────────────────────────────────────
router.get('/trips/:id/sync-preview', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params; // user's trip_id

    const link = db.prepare(`
      SELECT eut.id, eut.snapshot_version, ep.version as current_version, eut.source_trip_id
      FROM explore_user_trips eut
      JOIN explore_published ep ON ep.trip_id = eut.source_trip_id
      WHERE eut.trip_id = ? AND eut.user_id = ?
    `).get(id, authReq.user.id) as { id: number; snapshot_version: number; current_version: number; source_trip_id: number } | undefined;

    if (!link || link.snapshot_version >= link.current_version) {
      return res.json({ update_available: false });
    }

    // Get user's local changes
    const userDeltas = getDeltas(db, link.id);
    const deltaCount = getDeltaSummary(db, link.id);

    // TODO: Compare with creator changes from source trip updates
    // For now, just return delta summary
    res.json({
      update_available: true,
      current_version: link.snapshot_version,
      new_version: link.current_version,
      user_changes: deltaCount,
      has_conflicts: Object.keys(userDeltas).length > 0,
    });
  } catch (err: unknown) {
    console.error('Error fetching sync preview:', err);
    res.status(500).json({ error: 'Failed to fetch sync preview' });
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

    // Capture trip snapshot for change detection
    const days = db.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number').all(id) as any[];
    const places = db.prepare('SELECT * FROM places WHERE trip_id = ?').all(id) as any[];
    const snapshotData = JSON.stringify({ days, places });

    const descriptionsJson = descriptions ? JSON.stringify(descriptions) : '{}';
    const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : '[]';
    const bestSeasonJson = Array.isArray(best_season) ? JSON.stringify(best_season) : '[]';
    const communityFlag = community_enabled ? 1 : 0;
    const autoApproved = actor.creator_auto_approved === 1 || isAdmin(authReq.user.id);
    const status = autoApproved ? 'approved' : 'pending';
    const isPublished = autoApproved ? 1 : 0;

    const existingPublished = db.prepare('SELECT version FROM explore_published WHERE trip_id = ?').get(id) as { version: number } | undefined;
    const newVersion = (existingPublished?.version || 0) + 1;

    db.prepare(`
      INSERT INTO explore_published (trip_id, price, is_published, version, descriptions, community_enabled, status, submitted_by, last_published_at, listing_title, tagline, tags, destination, country_code, difficulty, best_season, snapshot_data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${autoApproved ? "datetime('now')" : 'NULL'}, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
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
        snapshot_data = excluded.snapshot_data,
        version = version + 1,
        updated_at = datetime('now')
    `).run(id, price || 0, isPublished, newVersion, descriptionsJson, communityFlag, status, authReq.user.id, listing_title || null, tagline || null, tagsJson, destination || null, country_code || null, difficulty || 'easy', bestSeasonJson, snapshotData);

    // Track version in explore_listing_versions
    db.prepare(`
      INSERT INTO explore_listing_versions (trip_id, version, listing_title, tagline, tags, destination, country_code, difficulty, best_season, price, descriptions, community_enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, newVersion, listing_title || null, tagline || null, tagsJson, destination || null, country_code || null, difficulty || 'easy', bestSeasonJson, price || 0, descriptionsJson, communityFlag);

    res.json({ success: true, status, auto_approved: autoApproved, version: newVersion });
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

// ── Creator: push direct update to published listing ────────────────────────
router.post('/trips/:id/push-update', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const { changelog } = req.body;

    // Get published listing
    const listing = db.prepare(`
      SELECT ep.*, t.user_id FROM explore_published ep
      JOIN trips t ON t.id = ep.trip_id
      WHERE ep.trip_id = ? AND ep.is_published = 1
    `).get(id) as { trip_id: number; user_id: number; version: number; submitted_by: number } | undefined;

    if (!listing) return res.status(404).json({ error: 'Published listing not found' });

    // Verify creator owns this trip
    if (listing.user_id !== authReq.user.id && !isAdmin(authReq.user.id)) {
      return res.status(403).json({ error: 'You can only update your own trips' });
    }

    // Increment version
    const newVersion = (listing.version || 1) + 1;

    // Capture updated trip snapshot
    const days = db.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number').all(id) as any[];
    const places = db.prepare('SELECT * FROM places WHERE trip_id = ?').all(id) as any[];
    const snapshotData = JSON.stringify({ days, places });

    // Update listing with new snapshot
    db.prepare(`
      UPDATE explore_published
      SET version = ?, snapshot_data = ?, updated_at = datetime('now')
      WHERE trip_id = ?
    `).run(newVersion, snapshotData, id);

    // Track version in explore_listing_versions
    db.prepare(`
      INSERT INTO explore_listing_versions (trip_id, version, changelog)
      VALUES (?, ?, ?)
    `).run(id, newVersion, changelog || null);

    // Notify all fork owners that update is available
    const forkOwners = db.prepare(`
      SELECT DISTINCT eut.user_id FROM explore_user_trips eut
      WHERE eut.source_trip_id = ? AND eut.user_id != ?
    `).all(id, authReq.user.id) as Array<{ user_id: number }>;

    // Send WebSocket notifications (fire-and-forget)
    import('../services/notificationService').then(({ send }) => {
      for (const owner of forkOwners) {
        send({
          event: 'explore_update_available',
          actorId: authReq.user.id,
          scope: 'user',
          targetId: owner.user_id,
          params: { tripId: String(id), version: String(newVersion) },
        }).catch(() => {});
      }
    });

    res.json({ success: true, version: newVersion, notified: forkOwners.length });
  } catch (err: unknown) {
    console.error('Error pushing update:', err);
    res.status(500).json({ error: 'Failed to push update' });
  }
});

// ── Creator: resubmit published listing for admin review ──────────────────
router.post('/trips/:id/resubmit-for-review', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const { message } = req.body;

    // Get published listing
    const listing = db.prepare(`
      SELECT ep.*, t.user_id FROM explore_published ep
      JOIN trips t ON t.id = ep.trip_id
      WHERE ep.trip_id = ? AND ep.is_published = 1
    `).get(id) as { trip_id: number; user_id: number; version: number; id: number } | undefined;

    if (!listing) return res.status(404).json({ error: 'Published listing not found' });

    // Verify creator owns this trip
    if (listing.user_id !== authReq.user.id && !isAdmin(authReq.user.id)) {
      return res.status(403).json({ error: 'You can only resubmit your own trips' });
    }

    // Update status to pending_review
    db.prepare(`
      UPDATE explore_published
      SET status = 'pending_review', updated_at = datetime('now')
      WHERE id = ?
    `).run(listing.id);

    // Notify admins
    const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all() as { id: number }[];
    for (const admin of admins) {
      db.prepare(`
        INSERT INTO notifications (user_id, type, title, message, data, created_at, is_read)
        VALUES (?, 'explore_resubmission', 'Listing Resubmitted for Review', ?, ?, datetime('now'), 0)
      `).run(admin.id, `Creator resubmitted listing for review${message ? ': ' + message : ''}`, JSON.stringify({ listing_id: listing.id }));
    }

    res.json({ success: true, message: 'Listing submitted for admin review' });
  } catch (err: unknown) {
    console.error('Error resubmitting listing:', err);
    res.status(500).json({ error: 'Failed to resubmit listing' });
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

// ── Admin: approve creator application ─────────────────────────────────────
router.post('/creators/:id/approve-application', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!isAdmin(authReq.user.id)) return res.status(403).json({ error: 'Admin only' });

    const { id } = req.params;
    const creator = db.prepare('SELECT id, user_id, status FROM explore_creators WHERE id = ?')
      .get(id) as { id: number; user_id: number; status: string } | undefined;

    if (!creator) return res.status(404).json({ error: 'Creator not found' });
    if (creator.status === 'approved') return res.status(409).json({ error: 'Already approved' });

    db.prepare('UPDATE explore_creators SET status = ?, approved_at = datetime("now"), approved_by = ? WHERE id = ?')
      .run('approved', authReq.user.id, id);

    // Award verified_creator badge
    recalculateCreatorBadges(db, creator.user_id);

    res.json({ success: true, message: 'Creator approved' });
  } catch (err: unknown) {
    console.error('Error approving creator:', err);
    res.status(500).json({ error: 'Failed to approve creator' });
  }
});

// ── Admin: reject creator application ───────────────────────────────────────
router.post('/creators/:id/reject-application', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!isAdmin(authReq.user.id)) return res.status(403).json({ error: 'Admin only' });

    const { id } = req.params;
    const { reason } = req.body;

    const creator = db.prepare('SELECT id, status FROM explore_creators WHERE id = ?')
      .get(id) as { id: number; status: string } | undefined;

    if (!creator) return res.status(404).json({ error: 'Creator not found' });
    if (creator.status !== 'pending') return res.status(400).json({ error: 'Only pending applications can be rejected' });

    db.prepare('UPDATE explore_creators SET status = ? WHERE id = ?')
      .run('rejected', id);

    res.json({ success: true, message: 'Creator application rejected' });
  } catch (err: unknown) {
    console.error('Error rejecting creator:', err);
    res.status(500).json({ error: 'Failed to reject creator' });
  }
});

// ── Admin: recalculate badges for all creators ─────────────────────────────
router.post('/admin/recalculate-badges', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!isAdmin(authReq.user.id)) return res.status(403).json({ error: 'Admin only' });

    const creators = db.prepare('SELECT user_id FROM explore_creators WHERE status = ?')
      .all('approved') as Array<{ user_id: number }>;

    let updated = 0;
    for (const creator of creators) {
      try {
        recalculateCreatorBadges(db, creator.user_id);
        updated++;
      } catch (err) {
        console.error(`Failed to recalculate badges for creator ${creator.user_id}:`, err);
      }
    }

    res.json({ success: true, updated, total: creators.length });
  } catch (err: unknown) {
    console.error('Error recalculating badges:', err);
    res.status(500).json({ error: 'Failed to recalculate badges' });
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

// ── Creator: check if trip is published ───────────────────────────────────
router.get('/trips/:id/publication-status', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;

    const listing = db.prepare(`
      SELECT ep.is_published, ep.status, ep.version, t.user_id
      FROM explore_published ep
      JOIN trips t ON t.id = ep.trip_id
      WHERE ep.trip_id = ? AND t.user_id = ?
    `).get(id, authReq.user.id) as { is_published: number; status: string; version: number; user_id: number } | undefined;

    if (!listing) {
      return res.json({ is_published: false });
    }

    res.json({
      is_published: listing.is_published === 1,
      status: listing.status,
      version: listing.version,
    });
  } catch (err: unknown) {
    console.error('Error checking publication status:', err);
    res.status(500).json({ error: 'Failed to check publication status' });
  }
});

// ── Creator: fetch published snapshot for change detection ────────────────
router.get('/trips/:id/published-snapshot', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;

    const listing = db.prepare(`
      SELECT ep.snapshot_data, t.user_id
      FROM explore_published ep
      JOIN trips t ON t.id = ep.trip_id
      WHERE ep.trip_id = ? AND t.user_id = ? AND ep.is_published = 1
    `).get(id, authReq.user.id) as { snapshot_data: string | null; user_id: number } | undefined;

    if (!listing) {
      return res.json({ snapshot: null });
    }

    let snapshot = null;
    if (listing.snapshot_data) {
      try {
        snapshot = JSON.parse(listing.snapshot_data);
      } catch (e) {
        console.error('Failed to parse snapshot data:', e);
      }
    }

    res.json({ snapshot });
  } catch (err: unknown) {
    console.error('Error fetching published snapshot:', err);
    res.status(500).json({ error: 'Failed to fetch published snapshot' });
  }
});

// ── Admin: approve submission ──────────────────────────────────────────────
router.post('/submissions/:id/approve', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!isAdmin(authReq.user.id)) return res.status(403).json({ error: 'Admin only' });

    const { id } = req.params;
    const { auto_approve, price, descriptions, community_enabled } = req.body;

    const submission = db.prepare('SELECT id, trip_id, submitted_by FROM explore_published WHERE id = ? AND (status = ? OR status = ?)').get(id, 'pending', 'pending_review') as { id: number; trip_id: number; submitted_by: number } | undefined;
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    const updates: string[] = ['is_published = 1', "status = 'approved'", "last_published_at = datetime('now')", "updated_at = datetime('now')"];
    const params: (string | number)[] = [];

    if (price !== undefined) { updates.push('price = ?'); params.push(price); }
    if (descriptions !== undefined) { updates.push('descriptions = ?'); params.push(JSON.stringify(descriptions)); }
    if (community_enabled !== undefined) { updates.push('community_enabled = ?'); params.push(community_enabled ? 1 : 0); }

    db.prepare(`UPDATE explore_published SET ${updates.join(', ')} WHERE id = ?`).run(...params, id);

    if (auto_approve && submission.submitted_by) {
      db.prepare('UPDATE users SET creator_auto_approved = 1 WHERE id = ?').run(submission.submitted_by);
    }

    // Recalculate creator badges after approval (might earn new badges)
    if (submission.submitted_by) {
      try { recalculateCreatorBadges(db, submission.submitted_by); } catch {}
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

    const submission = db.prepare('SELECT id FROM explore_published WHERE id = ? AND (status = ? OR status = ?)').get(id, 'pending', 'pending_review') as { id: number } | undefined;
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

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

// ── Get listing version history ────────────────────────────────────────────
router.get('/version-history/:tripId', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { tripId } = req.params;

    // Check permissions: admin or listing creator
    const listing = db.prepare('SELECT submitted_by FROM explore_published WHERE trip_id = ?').get(tripId) as { submitted_by: number } | undefined;
    if (!listing && !isAdmin(authReq.user.id)) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    if (listing && listing.submitted_by !== authReq.user.id && !isAdmin(authReq.user.id)) {
      return res.status(403).json({ error: 'Not authorized to view version history' });
    }

    const versions = db.prepare(`
      SELECT * FROM explore_listing_versions
      WHERE trip_id = ?
      ORDER BY version DESC
    `).all(tripId) as any[];

    res.json({ versions });
  } catch (err: unknown) {
    console.error('Error fetching version history:', err);
    res.status(500).json({ error: 'Failed to fetch version history' });
  }
});

// ── Admin: suspend listing ─────────────────────────────────────────────────
router.post('/submissions/:id/suspend', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!isAdmin(authReq.user.id)) return res.status(403).json({ error: 'Admin only' });

    const { id } = req.params;
    const { reason } = req.body;

    const submission = db.prepare('SELECT id FROM explore_published WHERE id = ?').get(id) as { id: number } | undefined;
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    db.prepare(`
      UPDATE explore_published
      SET is_suspended = 1, suspension_reason = ?, suspended_at = datetime('now'), suspended_by = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(reason || null, authReq.user.id, id);

    res.json({ success: true, message: 'Listing suspended' });
  } catch (err: unknown) {
    console.error('Error suspending listing:', err);
    res.status(500).json({ error: 'Failed to suspend listing' });
  }
});

// ── Admin: unsuspend listing ───────────────────────────────────────────────
router.post('/submissions/:id/unsuspend', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!isAdmin(authReq.user.id)) return res.status(403).json({ error: 'Admin only' });

    const { id } = req.params;

    const submission = db.prepare('SELECT id FROM explore_published WHERE id = ?').get(id) as { id: number } | undefined;
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    db.prepare(`
      UPDATE explore_published
      SET is_suspended = 0, suspension_reason = NULL, suspended_at = NULL, suspended_by = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(id);

    res.json({ success: true, message: 'Listing unsuspended' });
  } catch (err: unknown) {
    console.error('Error unsuspending listing:', err);
    res.status(500).json({ error: 'Failed to unsuspend listing' });
  }
});

// ── Admin: suspend creator ─────────────────────────────────────────────────
router.post('/creators/:id/suspend', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!isAdmin(authReq.user.id)) return res.status(403).json({ error: 'Admin only' });

    const { id } = req.params;
    const { reason } = req.body;

    const creator = db.prepare('SELECT id FROM explore_creators WHERE id = ?').get(id) as { id: number } | undefined;
    if (!creator) return res.status(404).json({ error: 'Creator not found' });

    db.prepare(`
      UPDATE explore_creators
      SET is_suspended = 1, suspension_reason = ?, suspended_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(reason || null, id);

    // Also suspend all their listings
    db.prepare(`
      UPDATE explore_published
      SET is_suspended = 1, suspension_reason = 'Creator account suspended', suspended_by = ?, updated_at = datetime('now')
      WHERE submitted_by = (SELECT user_id FROM explore_creators WHERE id = ?)
    `).run(authReq.user.id, id);

    res.json({ success: true, message: 'Creator suspended' });
  } catch (err: unknown) {
    console.error('Error suspending creator:', err);
    res.status(500).json({ error: 'Failed to suspend creator' });
  }
});

// ── Admin: unsuspend creator ───────────────────────────────────────────────
router.post('/creators/:id/unsuspend', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!isAdmin(authReq.user.id)) return res.status(403).json({ error: 'Admin only' });

    const { id } = req.params;

    const creator = db.prepare('SELECT id FROM explore_creators WHERE id = ?').get(id) as { id: number } | undefined;
    if (!creator) return res.status(404).json({ error: 'Creator not found' });

    db.prepare(`
      UPDATE explore_creators
      SET is_suspended = 0, suspension_reason = NULL, suspended_at = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(id);

    // Unsuspend all their listings
    db.prepare(`
      UPDATE explore_published
      SET is_suspended = 0, suspension_reason = NULL, suspended_at = NULL, suspended_by = NULL, updated_at = datetime('now')
      WHERE submitted_by = (SELECT user_id FROM explore_creators WHERE id = ?) AND suspension_reason = 'Creator account suspended'
    `).run(id);

    res.json({ success: true, message: 'Creator unsuspended' });
  } catch (err: unknown) {
    console.error('Error unsuspending creator:', err);
    res.status(500).json({ error: 'Failed to unsuspend creator' });
  }
});

// ── Admin: toggle featured listing ─────────────────────────────────────────
router.patch('/trips/:id/featured', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!isAdmin(authReq.user.id)) return res.status(403).json({ error: 'Admin only' });

    const { id } = req.params;
    const { featured } = req.body;

    if (typeof featured !== 'boolean') {
      return res.status(400).json({ error: 'featured must be a boolean' });
    }

    const listing = db.prepare('SELECT id FROM explore_published WHERE trip_id = ?').get(id) as { id: number } | undefined;
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    try {
      db.prepare('UPDATE explore_published SET is_featured = ?, updated_at = datetime(\'now\') WHERE trip_id = ?')
        .run(featured ? 1 : 0, id);
    } catch (err: any) {
      if (!err.message?.includes('no such column')) throw err;
      // is_featured column may not exist yet in migration-based schemas
      console.warn('[explore] is_featured column does not exist, skipping update');
    }

    res.json({ success: true, featured });
  } catch (err: unknown) {
    console.error('Error toggling featured listing:', err);
    res.status(500).json({ error: 'Failed to toggle featured status' });
  }
});

// ── Get fork deltas (changes between source and forked trip) ─────────────────
router.get('/fork-deltas/:sourceId/:forkedId', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { sourceId, forkedId } = req.params;

    // Check permissions: user must own the forked trip
    const forkedTrip = db.prepare('SELECT user_id FROM trips WHERE id = ?').get(forkedId) as { user_id: number } | undefined;
    if (!forkedTrip || (forkedTrip.user_id !== authReq.user.id && !isAdmin(authReq.user.id))) {
      return res.status(403).json({ error: 'Not authorized to view fork deltas' });
    }

    // Get deltas
    const deltas = db.prepare(`
      SELECT * FROM explore_fork_deltas
      WHERE source_trip_id = ? AND forked_trip_id = ?
      ORDER BY created_at DESC
    `).all(sourceId, forkedId) as any[];

    // Count by type
    const deltasByType: Record<string, number> = {};
    for (const delta of deltas) {
      deltasByType[delta.delta_type] = (deltasByType[delta.delta_type] || 0) + 1;
    }

    res.json({ deltas, summary: deltasByType, total: deltas.length });
  } catch (err: unknown) {
    console.error('Error fetching fork deltas:', err);
    res.status(500).json({ error: 'Failed to fetch fork deltas' });
  }
});

// ── Reviews & Ratings ─────────────────────────────────────────────────────

// Get reviews for a trip
router.get('/trips/:sourceTripId/reviews', (req: Request, res: Response) => {
  try {
    const { sourceTripId } = req.params;
    const sortBy = req.query.sortBy as string || 'recent';

    let orderClause = 'ORDER BY er.created_at DESC';
    if (sortBy === 'helpful') {
      orderClause = 'ORDER BY (er.helpful_count - er.unhelpful_count) DESC, er.created_at DESC';
    } else if (sortBy === 'rating_high') {
      orderClause = 'ORDER BY er.rating DESC, er.created_at DESC';
    } else if (sortBy === 'rating_low') {
      orderClause = 'ORDER BY er.rating ASC, er.created_at DESC';
    }

    const reviews = db.prepare(`
      SELECT
        er.id, er.source_trip_id, er.user_id, er.rating, er.title, er.content,
        er.helpful_count, er.unhelpful_count, er.created_at,
        u.username, u.avatar,
        COALESCE((SELECT COUNT(*) FROM explore_review_helpful WHERE review_id = er.id AND is_helpful = 1), 0) as current_helpful,
        COALESCE((SELECT COUNT(*) FROM explore_review_helpful WHERE review_id = er.id AND is_helpful = 0), 0) as current_unhelpful
      FROM explore_reviews er
      JOIN users u ON u.id = er.user_id
      WHERE er.source_trip_id = ?
      ${orderClause}
    `).all(sourceTripId) as any[];

    // Calculate average rating
    const avgRating = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as count FROM explore_reviews WHERE source_trip_id = ?')
      .get(sourceTripId) as { avg: number; count: number } | undefined;

    res.json({
      reviews,
      average_rating: avgRating?.avg || 0,
      review_count: avgRating?.count || 0,
    });
  } catch (err: unknown) {
    console.error('Error fetching reviews:', err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Create review
router.post('/trips/:sourceTripId/reviews', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { sourceTripId } = req.params;
    const { rating, title, content } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Review content is required' });
    }

    // Check if trip is published
    const ep = db.prepare('SELECT trip_id FROM explore_published WHERE trip_id = ? AND is_published = 1')
      .get(sourceTripId);
    if (!ep) return res.status(404).json({ error: 'Trip not found or not published' });

    // Check if user already reviewed (update existing)
    const existing = db.prepare('SELECT id FROM explore_reviews WHERE source_trip_id = ? AND user_id = ?')
      .get(sourceTripId, userId) as { id: number } | undefined;

    if (existing) {
      db.prepare(`
        UPDATE explore_reviews
        SET rating = ?, title = ?, content = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(rating, title || null, content, existing.id);
      return res.json({ success: true, review_id: existing.id, created: false });
    }

    // Create new review
    const result = db.prepare(`
      INSERT INTO explore_reviews (source_trip_id, user_id, rating, title, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(sourceTripId, userId, rating, title || null, content);

    // Recalculate creator badges (might earn highly_rated badge)
    const creator = db.prepare('SELECT submitted_by FROM explore_published WHERE trip_id = ?')
      .get(sourceTripId) as { submitted_by: number } | undefined;
    if (creator) {
      try { recalculateCreatorBadges(db, creator.submitted_by); } catch {}
    }

    res.status(201).json({ success: true, review_id: result.lastInsertRowid, created: true });
  } catch (err: unknown) {
    console.error('Error creating review:', err);
    res.status(500).json({ error: 'Failed to create review' });
  }
});

// Delete review
router.delete('/reviews/:reviewId', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { reviewId } = req.params;

    const review = db.prepare('SELECT id, user_id FROM explore_reviews WHERE id = ?')
      .get(reviewId) as { id: number; user_id: number } | undefined;
    if (!review) return res.status(404).json({ error: 'Review not found' });

    if (review.user_id !== userId && !isAdmin(userId)) {
      return res.status(403).json({ error: 'Not authorized to delete this review' });
    }

    db.prepare('DELETE FROM explore_reviews WHERE id = ?').run(reviewId);
    res.json({ success: true, message: 'Review deleted' });
  } catch (err: unknown) {
    console.error('Error deleting review:', err);
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

// Mark review as helpful/unhelpful
router.post('/reviews/:reviewId/helpful', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { reviewId } = req.params;
    const { is_helpful } = req.body;

    if (typeof is_helpful !== 'boolean') {
      return res.status(400).json({ error: 'is_helpful must be boolean' });
    }

    const review = db.prepare('SELECT id FROM explore_reviews WHERE id = ?').get(reviewId);
    if (!review) return res.status(404).json({ error: 'Review not found' });

    // Check if user already voted
    const existing = db.prepare('SELECT id, is_helpful FROM explore_review_helpful WHERE review_id = ? AND user_id = ?')
      .get(reviewId, userId) as { id: number; is_helpful: number } | undefined;

    if (existing) {
      if (existing.is_helpful === (is_helpful ? 1 : 0)) {
        return res.status(200).json({ success: true, message: 'Already voted' });
      }
      // Update vote
      db.prepare('UPDATE explore_review_helpful SET is_helpful = ? WHERE id = ?')
        .run(is_helpful ? 1 : 0, existing.id);
    } else {
      // Create vote
      db.prepare('INSERT INTO explore_review_helpful (review_id, user_id, is_helpful) VALUES (?, ?, ?)')
        .run(reviewId, userId, is_helpful ? 1 : 0);
    }

    // Update counts
    const counts = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN is_helpful = 1 THEN 1 ELSE 0 END), 0) as helpful,
        COALESCE(SUM(CASE WHEN is_helpful = 0 THEN 1 ELSE 0 END), 0) as unhelpful
      FROM explore_review_helpful
      WHERE review_id = ?
    `).get(reviewId) as { helpful: number; unhelpful: number };

    db.prepare('UPDATE explore_reviews SET helpful_count = ?, unhelpful_count = ? WHERE id = ?')
      .run(counts.helpful, counts.unhelpful, reviewId);

    res.json({ success: true, helpful_count: counts.helpful, unhelpful_count: counts.unhelpful });
  } catch (err: unknown) {
    console.error('Error marking review helpful:', err);
    res.status(500).json({ error: 'Failed to update helpful status' });
  }
});

// Remove helpful vote
router.delete('/reviews/:reviewId/helpful', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { reviewId } = req.params;

    db.prepare('DELETE FROM explore_review_helpful WHERE review_id = ? AND user_id = ?')
      .run(reviewId, userId);

    // Update counts
    const counts = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN is_helpful = 1 THEN 1 ELSE 0 END), 0) as helpful,
        COALESCE(SUM(CASE WHEN is_helpful = 0 THEN 1 ELSE 0 END), 0) as unhelpful
      FROM explore_review_helpful
      WHERE review_id = ?
    `).get(reviewId) as { helpful: number; unhelpful: number };

    db.prepare('UPDATE explore_reviews SET helpful_count = ?, unhelpful_count = ? WHERE id = ?')
      .run(counts.helpful, counts.unhelpful, reviewId);

    res.json({ success: true, helpful_count: counts.helpful, unhelpful_count: counts.unhelpful });
  } catch (err: unknown) {
    console.error('Error removing helpful vote:', err);
    res.status(500).json({ error: 'Failed to remove helpful vote' });
  }
});

export default router;
