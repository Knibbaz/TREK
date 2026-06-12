import { db, canAccessTrip } from '../db/database';
import crypto from 'crypto';
import { loadTagsByPlaceIds } from './queryHelpers';
import { serveFilePath } from './placePhotoCache';

const PLACE_PHOTO_PROXY_PREFIX = '/api/maps/place-photo/';

/**
 * Place photo proxy URLs (`/api/maps/place-photo/<id>/bytes`) are served by the
 * JWT-guarded MapsController, so they 401 for an unauthenticated shared-trip
 * viewer. Rewrite them to the public, token-scoped equivalent
 * (`/api/shared/<token>/place-photo/<id>/bytes`) so thumbnails load in a shared
 * link. A simple prefix swap keeps the already-encoded placeId segment intact, so
 * the URL round-trips. Non-proxy URLs (data:, /uploads/, null) pass through.
 */
function rewritePlacePhotoUrl(url: string | null | undefined, token: string): string | null {
  if (typeof url === 'string' && url.startsWith(PLACE_PHOTO_PROXY_PREFIX)) {
    return `/api/shared/${token}/place-photo/${url.slice(PLACE_PHOTO_PROXY_PREFIX.length)}`;
  }
  return url ?? null;
}

interface SharePermissions {
  share_map?: boolean;
  share_plan?: boolean;
  share_bookings?: boolean;
  share_packing?: boolean;
  share_budget?: boolean;
  share_collab?: boolean;
  allow_clone?: boolean;
  share_description?: boolean;
}

interface ShareTokenInfo {
  token: string;
  created_at: string;
  share_map: boolean;
  share_plan: boolean;
  share_bookings: boolean;
  share_packing: boolean;
  share_budget: boolean;
  share_collab: boolean;
  allow_clone: boolean;
  share_description: boolean;
}

/**
 * Creates a new share link or updates the permissions on an existing one.
 * Returns an object with the token string and whether it was newly created.
 */
export function createOrUpdateShareLink(
  tripId: string,
  createdBy: number,
  permissions: SharePermissions
): { token: string; created: boolean } {
  const {
    share_map = true,
    share_plan = true,
    share_bookings = true,
    share_packing = false,
    share_budget = false,
    share_collab = false,
    allow_clone = false,
    share_description = false,
  } = permissions;

  const existing = db.prepare('SELECT token FROM share_tokens WHERE trip_id = ?').get(tripId) as { token: string } | undefined;
  if (existing) {
    db.prepare('UPDATE share_tokens SET share_map = ?, share_plan = ?, share_bookings = ?, share_packing = ?, share_budget = ?, share_collab = ?, allow_clone = ?, share_description = ? WHERE trip_id = ?')
      .run(share_map ? 1 : 0, share_plan ? 1 : 0, share_bookings ? 1 : 0, share_packing ? 1 : 0, share_budget ? 1 : 0, share_collab ? 1 : 0, allow_clone ? 1 : 0, share_description ? 1 : 0, tripId);
    return { token: existing.token, created: false };
  }

  // New share links default to a 90-day TTL.
  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO share_tokens (trip_id, token, created_by, share_map, share_plan, share_bookings, share_packing, share_budget, share_collab, allow_clone, share_description, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(tripId, token, createdBy, share_map ? 1 : 0, share_plan ? 1 : 0, share_bookings ? 1 : 0, share_packing ? 1 : 0, share_budget ? 1 : 0, share_collab ? 1 : 0, allow_clone ? 1 : 0, share_description ? 1 : 0, expiresAt);
  return { token, created: true };
}

/**
 * Returns share token info for a trip, or null if no share link exists.
 */
export function getShareLinks(tripId: string): ShareTokenInfo | null {
  const row = db.prepare('SELECT * FROM share_tokens WHERE trip_id = ?').get(tripId) as any;
  if (!row) return null;
  return {
    token: row.token,
    created_at: row.created_at,
    share_map: !!row.share_map,
    share_plan: row.share_plan !== undefined ? !!row.share_plan : true,
    share_bookings: !!row.share_bookings,
    share_packing: !!row.share_packing,
    share_budget: !!row.share_budget,
    share_collab: !!row.share_collab,
    allow_clone: !!row.allow_clone,
    share_description: !!row.share_description,
  };
}

/**
 * Deletes the share token for a trip.
 */
export function deleteShareLink(tripId: string): void {
  db.prepare('DELETE FROM share_tokens WHERE trip_id = ?').run(tripId);
}

/**
 * Loads the full public trip data for a share token, filtered by the token's
 * permission flags. Returns null if the token is invalid or the trip is gone.
 */
export function getSharedTripData(token: string): Record<string, any> | null {
  const shareRow = db.prepare(
    "SELECT * FROM share_tokens WHERE token = ? AND (expires_at IS NULL OR expires_at > datetime('now'))"
  ).get(token) as any;
  if (!shareRow) return null;

  const tripId = shareRow.trip_id;

  // Trip
  const trip = db.prepare('SELECT id, title, description, start_date, end_date, cover_image, currency FROM trips WHERE id = ?').get(tripId);
  if (!trip) return null;

  // Days with assignments
  const days = db.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number ASC').all(tripId) as any[];
  const dayIds = days.map(d => d.id);

  let assignments: Record<number, any[]> = {};
  let dayNotes: Record<number, any[]> = {};
  if (dayIds.length > 0) {
    const ph = dayIds.map(() => '?').join(',');
    const allAssignments = db.prepare(`
      SELECT da.*, p.id as place_id, p.name as place_name, p.description as place_description,
        p.lat, p.lng, p.address, p.category_id, p.price, p.currency as place_currency,
        COALESCE(da.assignment_time, p.place_time) as place_time,
        COALESCE(da.assignment_end_time, p.end_time) as end_time,
        p.duration_minutes, p.notes as place_notes, p.image_url, p.transport_mode,
        p.website, p.phone,
        c.name as category_name, c.color as category_color, c.icon as category_icon
      FROM day_assignments da
      JOIN places p ON da.place_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE da.day_id IN (${ph})
      ORDER BY da.order_index ASC, da.created_at ASC
    `).all(...dayIds);

    const placeIds = [...new Set(allAssignments.map((a: any) => a.place_id))];
    const tagsByPlace = loadTagsByPlaceIds(placeIds, { compact: true });

    const byDay: Record<number, any[]> = {};
    for (const a of allAssignments as any[]) {
      if (!byDay[a.day_id]) byDay[a.day_id] = [];
      byDay[a.day_id].push({
        id: a.id, day_id: a.day_id, order_index: a.order_index, notes: a.notes,
        place: {
          id: a.place_id, name: a.place_name, description: a.place_description,
          lat: a.lat, lng: a.lng, address: a.address, category_id: a.category_id,
          price: a.price, place_time: a.place_time, end_time: a.end_time,
          image_url: rewritePlacePhotoUrl(a.image_url, token), transport_mode: a.transport_mode,
          website: a.website, phone: a.phone,
          category: a.category_id ? { id: a.category_id, name: a.category_name, color: a.category_color, icon: a.category_icon } : null,
          tags: tagsByPlace[a.place_id] || [],
        }
      });
    }
    assignments = byDay;

    // Personal notes are never shared — filtered out in shared view
    dayNotes = {};
  }

  // Places (restructure to match day_assignments format with category object)
  const placesRaw = db.prepare(`
    SELECT p.*, c.name as category_name, c.color as category_color, c.icon as category_icon
    FROM places p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.trip_id = ? ORDER BY p.created_at DESC
  `).all(tripId) as any[];

  const places = placesRaw.map(p => ({
    ...p,
    image_url: rewritePlacePhotoUrl(p.image_url, token),
    category: p.category_id ? { id: p.category_id, name: p.category_name, color: p.category_color, icon: p.category_icon } : null,
  }));

  // Reservations — include per-day positions so the client can render the same order as the planner
  const reservations = db.prepare('SELECT * FROM reservations WHERE trip_id = ? ORDER BY reservation_time ASC').all(tripId) as any[];

  const dayPositions = db.prepare(`
    SELECT rdp.reservation_id, rdp.day_id, rdp.position
    FROM reservation_day_positions rdp
    JOIN reservations r ON rdp.reservation_id = r.id
    WHERE r.trip_id = ?
  `).all(tripId) as { reservation_id: number; day_id: number; position: number }[];

  const posMap = new Map<number, Record<number, number>>();
  for (const dp of dayPositions) {
    if (!posMap.has(dp.reservation_id)) posMap.set(dp.reservation_id, {});
    posMap.get(dp.reservation_id)![dp.day_id] = dp.position;
  }
  for (const r of reservations) {
    r.day_positions = posMap.get(r.id) || null;
  }

  // Accommodations
  const accommodations = db.prepare(`
    SELECT a.*, p.name as place_name, p.address as place_address, p.lat as place_lat, p.lng as place_lng
    FROM day_accommodations a JOIN places p ON a.place_id = p.id
    WHERE a.trip_id = ?
  `).all(tripId);

  // Packing
  const packing = db.prepare('SELECT * FROM packing_items WHERE trip_id = ? ORDER BY sort_order ASC').all(tripId);

  // Budget
  const budget = db.prepare('SELECT * FROM budget_items WHERE trip_id = ? ORDER BY category ASC').all(tripId);

  // Categories
  const categories = db.prepare('SELECT * FROM categories').all();

  const permissions = {
    share_map: !!shareRow.share_map,
    share_plan: shareRow.share_plan !== undefined ? !!shareRow.share_plan : true,
    share_bookings: !!shareRow.share_bookings,
    share_packing: !!shareRow.share_packing,
    share_budget: !!shareRow.share_budget,
    share_collab: !!shareRow.share_collab,
    allow_clone: !!shareRow.allow_clone,
    share_description: !!shareRow.share_description,
  };

  // Collab messages (only if owner chose to share)
  const collabMessages = permissions.share_collab
    ? db.prepare('SELECT m.*, u.username, u.avatar FROM collab_messages m JOIN users u ON m.user_id = u.id WHERE m.trip_id = ? AND m.deleted = 0 ORDER BY m.created_at').all(tripId)
    : [];

  return {
    trip, days, assignments, dayNotes, places, categories, permissions,
    reservations: permissions.share_bookings ? reservations : [],
    accommodations: permissions.share_bookings ? accommodations : [],
    packing: permissions.share_packing ? packing : [],
    budget: permissions.share_budget ? budget : [],
    collab: collabMessages,
  };
}

/**
 * Resolves the on-disk path for a cached place photo requested through a public
 * share link. Validates that the token is valid + unexpired and that the place
 * actually belongs to that token's trip (matched via the stored proxy URL, which
 * covers both Google `placeId` and Wikimedia `coords:` pseudo-IDs without
 * depending on google_place_id). Returns null — never throws — so the caller
 * answers a plain 404, mirroring the authenticated bytes endpoint.
 */
export function getSharedPlacePhotoPath(token: string, placeId: string): string | null {
  const shareRow = db.prepare(
    "SELECT trip_id FROM share_tokens WHERE token = ? AND (expires_at IS NULL OR expires_at > datetime('now'))"
  ).get(token) as { trip_id: string } | undefined;
  if (!shareRow) return null;

  const expectedUrl = `${PLACE_PHOTO_PROXY_PREFIX}${encodeURIComponent(placeId)}/bytes`;
  const place = db.prepare(
    'SELECT 1 FROM places WHERE trip_id = ? AND image_url = ?'
  ).get(shareRow.trip_id, expectedUrl);
  if (!place) return null;

  return serveFilePath(placeId);
}

// ── Collaboration invite tokens ────────────────────────────────────────────

/**
 * Creates or replaces the collab invite token for a trip.
 * Only one active token per trip (UNIQUE on trip_id).
 */
export function createCollabInviteToken(tripId: string, createdBy: number): string {
  db.prepare('DELETE FROM trip_collab_tokens WHERE trip_id = ?').run(tripId);
  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
  db.prepare('INSERT INTO trip_collab_tokens (trip_id, token, created_by, expires_at) VALUES (?, ?, ?, ?)')
    .run(tripId, token, createdBy, expiresAt);
  return token;
}

/**
 * Returns active collab invite token for a trip, or null if none.
 */
export function getCollabInviteToken(tripId: string): { token: string; expires_at: string | null; visible_to_members: boolean } | null {
  const row = db.prepare(
    "SELECT token, expires_at, visible_to_members FROM trip_collab_tokens WHERE trip_id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))"
  ).get(tripId) as { token: string; expires_at: string | null; visible_to_members: number } | undefined;
  if (!row) return null;
  return { token: row.token, expires_at: row.expires_at, visible_to_members: !!row.visible_to_members };
}

/**
 * Updates visible_to_members flag on the collab invite token.
 */
export function setCollabInviteVisibility(tripId: string, visible: boolean): void {
  db.prepare('UPDATE trip_collab_tokens SET visible_to_members = ? WHERE trip_id = ?').run(visible ? 1 : 0, tripId);
}

/**
 * Revokes the collab invite token for a trip.
 */
export function revokeCollabInviteToken(tripId: string): void {
  db.prepare('DELETE FROM trip_collab_tokens WHERE trip_id = ?').run(tripId);
}

/**
 * Validates a collab invite token and returns trip info, or null if invalid.
 */
export function validateCollabInviteToken(token: string): { tripId: number; tripTitle: string; ownerId: number } | null {
  const row = db.prepare(`
    SELECT tct.trip_id, t.title AS trip_title, t.user_id AS owner_id
    FROM trip_collab_tokens tct
    JOIN trips t ON t.id = tct.trip_id
    WHERE tct.token = ? AND (tct.expires_at IS NULL OR tct.expires_at > datetime('now'))
  `).get(token) as { trip_id: number; trip_title: string; owner_id: number } | undefined;
  if (!row) return null;
  return { tripId: row.trip_id, tripTitle: row.trip_title, ownerId: row.owner_id };
}

/**
 * Adds a user as collaborator via a collab invite token.
 * Returns the trip ID on success, or an error string.
 */
export function joinTripWithCollabToken(token: string, userId: number): { tripId: number } | { error: string; status: number } {
  const info = validateCollabInviteToken(token);
  if (!info) return { error: 'Invalid or expired invite link', status: 404 };
  if (info.ownerId === userId) return { error: 'You are the owner of this trip', status: 400 };

  const existing = db.prepare('SELECT id FROM trip_members WHERE trip_id = ? AND user_id = ?').get(info.tripId, userId);
  if (existing) return { tripId: info.tripId }; // already a member — silently succeed

  db.prepare('INSERT INTO trip_members (trip_id, user_id, invited_by) VALUES (?, ?, ?)').run(info.tripId, userId, info.ownerId);
  return { tripId: info.tripId };
}

/**
 * Logs a visitor to a shared trip. Uses session-based tracking via cookies.
 * Session ID should be derived from a persistent session cookie.
 */
export function logShareVisit(token: string, sessionId: string, userAgent?: string, ipAddress?: string): void {
  try {
    const userAgentHash = userAgent ? crypto.createHash('sha256').update(userAgent).digest('hex') : null;
    db.prepare(`
      INSERT OR IGNORE INTO share_visits (token, session_id, user_agent_hash, ip_address, visited_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(token, sessionId, userAgentHash, ipAddress);
  } catch (err) {
    console.error('[shareService] Failed to log share visit:', err);
  }
}

/**
 * Gets visitor statistics for a shared trip (admin only).
 * Returns unique visitor count and list of recent visits.
 */
export function getShareVisitStats(token: string): { uniqueVisitors: number; recentVisits: Array<{ visitedAt: string; userAgentHash?: string }> } | null {
  const share = db.prepare('SELECT trip_id FROM share_tokens WHERE token = ?').get(token) as { trip_id: number } | undefined;
  if (!share) return null;

  const stats = db.prepare(`
    SELECT COUNT(DISTINCT session_id) as unique_count
    FROM share_visits
    WHERE token = ?
  `).get(token) as { unique_count: number } | undefined;

  const recent = db.prepare(`
    SELECT visited_at, user_agent_hash
    FROM share_visits
    WHERE token = ?
    ORDER BY visited_at DESC
    LIMIT 100
  `).all(token) as Array<{ visited_at: string; user_agent_hash?: string }>;

  return {
    uniqueVisitors: stats?.unique_count || 0,
    recentVisits: recent.map(r => ({ visitedAt: r.visited_at, userAgentHash: r.user_agent_hash })),
  };
}
