import { db } from '../../db/database';

// All entity tables that can be exported
export const ENTITY_TABLES = [
  'trips',
  'days',
  'places',
  'day_assignments',
  'budget_items',
  'budget_item_members',
  'budget_category_order',
  'reservations',
  'reservation_endpoints',
  'reservation_day_positions',
  'packing_items',
  'packing_bags',
  'packing_bag_members',
  'packing_category_assignees',
  'packing_templates',
  'packing_template_categories',
  'packing_template_items',
  'todo_items',
  'todo_category_assignees',
  'lists',
  'list_items',
  'notes',
  'documents',
  'tags',
  'place_tags',
  'categories',
  'collab_notes',
  'collab_polls',
  'collab_poll_votes',
  'collab_messages',
  'collab_message_reactions',
  'trip_members',
  'share_tokens',
  'trip_collab_tokens',
  'day_notes',
  'day_accommodations',
  'file_links',
  'photos',
  'trip_files',
] as const;

export interface ScopeOptions {
  trips?: boolean;
  users?: boolean;
  settings?: boolean;
  uploads?: boolean;
  explore?: boolean;
}

export interface FilterOptions {
  user_ids?: string[];
  trip_ids?: string[];
  date_from?: string;
  date_to?: string;
}

function buildTripFilter(filter: FilterOptions): string {
  const conditions: string[] = [];
  if (filter.trip_ids && filter.trip_ids.length > 0) {
    conditions.push(`id IN (${filter.trip_ids.map(() => '?').join(',')})`);
  }
  if (filter.date_from) {
    conditions.push("created_at >= ?");
  }
  if (filter.date_to) {
    conditions.push("created_at <= ?");
  }
  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}

function buildTripParams(filter: FilterOptions): (string | number)[] {
  const params: (string | number)[] = [];
  if (filter.trip_ids) params.push(...filter.trip_ids);
  if (filter.date_from) params.push(filter.date_from);
  if (filter.date_to) params.push(filter.date_to);
  return params;
}

export function getTrips(filter: FilterOptions = {}): Array<Record<string, unknown>> {
  const where = buildTripFilter(filter);
  const stmt = db.prepare(`SELECT * FROM trips ${where}`);
  return stmt.all(...buildTripParams(filter)) as Array<Record<string, unknown>>;
}

export function getTripsForUser(userId: string): Array<Record<string, unknown>> {
  // Trips where user is owner OR member
  return db.prepare(`
    SELECT DISTINCT t.* FROM trips t
    LEFT JOIN trip_members tm ON tm.trip_id = t.id
    WHERE t.user_id = ? OR tm.user_id = ?
  `).all(userId, userId) as Array<Record<string, unknown>>;
}

export function getDays(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM days WHERE trip_id IN (${placeholders})`).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getPlaces(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM places WHERE trip_id IN (${placeholders})`).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getDayAssignments(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`
    SELECT da.* FROM day_assignments da
    JOIN days d ON d.id = da.day_id
    WHERE d.trip_id IN (${placeholders})
  `).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getBudgetItems(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM budget_items WHERE trip_id IN (${placeholders})`).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getBudgetItemMembers(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`
    SELECT bm.* FROM budget_item_members bm
    JOIN budget_items bi ON bi.id = bm.budget_item_id
    WHERE bi.trip_id IN (${placeholders})
  `).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getReservations(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM reservations WHERE trip_id IN (${placeholders})`).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getReservationEndpoints(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`
    SELECT re.* FROM reservation_endpoints re
    JOIN reservations r ON r.id = re.reservation_id
    WHERE r.trip_id IN (${placeholders})
  `).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getReservationDayPositions(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`
    SELECT rdp.* FROM reservation_day_positions rdp
    JOIN reservations r ON r.id = rdp.reservation_id
    WHERE r.trip_id IN (${placeholders})
  `).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getPackingItems(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM packing_items WHERE trip_id IN (${placeholders})`).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getPackingBags(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM packing_bags WHERE trip_id IN (${placeholders})`).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getPackingBagMembers(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`
    SELECT pbm.* FROM packing_bag_members pbm
    JOIN packing_bags pb ON pb.id = pbm.bag_id
    WHERE pb.trip_id IN (${placeholders})
  `).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getPackingCategoryAssignees(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM packing_category_assignees WHERE trip_id IN (${placeholders})`).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getPackingTemplates(): Array<Record<string, unknown>> {
  return db.prepare('SELECT * FROM packing_templates').all() as Array<Record<string, unknown>>;
}

export function getPackingTemplateCategories(): Array<Record<string, unknown>> {
  return db.prepare('SELECT * FROM packing_template_categories').all() as Array<Record<string, unknown>>;
}

export function getPackingTemplateItems(): Array<Record<string, unknown>> {
  return db.prepare('SELECT * FROM packing_template_items').all() as Array<Record<string, unknown>>;
}

export function getTodoItems(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM todo_items WHERE trip_id IN (${placeholders})`).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getTodoCategoryAssignees(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM todo_category_assignees WHERE trip_id IN (${placeholders})`).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getLists(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM lists WHERE trip_id IN (${placeholders})`).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getListItems(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`
    SELECT li.* FROM list_items li
    JOIN lists l ON l.id = li.list_id
    WHERE l.trip_id IN (${placeholders})
  `).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getNotes(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM notes WHERE trip_id IN (${placeholders})`).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getDocuments(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM documents WHERE trip_id IN (${placeholders})`).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getTags(userIds?: string[]): Array<Record<string, unknown>> {
  if (userIds && userIds.length > 0) {
    const placeholders = userIds.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM tags WHERE user_id IN (${placeholders})`).all(...userIds) as Array<Record<string, unknown>>;
  }
  return db.prepare('SELECT * FROM tags').all() as Array<Record<string, unknown>>;
}

export function getPlaceTags(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`
    SELECT pt.* FROM place_tags pt
    JOIN places p ON p.id = pt.place_id
    WHERE p.trip_id IN (${placeholders})
  `).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getCategories(): Array<Record<string, unknown>> {
  return db.prepare('SELECT * FROM categories').all() as Array<Record<string, unknown>>;
}

export function getCollabNotes(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM collab_notes WHERE trip_id IN (${placeholders})`).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getCollabPolls(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM collab_polls WHERE trip_id IN (${placeholders})`).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getCollabPollVotes(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`
    SELECT cpv.* FROM collab_poll_votes cpv
    JOIN collab_polls cp ON cp.id = cpv.poll_id
    WHERE cp.trip_id IN (${placeholders})
  `).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getCollabMessages(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM collab_messages WHERE trip_id IN (${placeholders})`).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getCollabMessageReactions(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`
    SELECT cmr.* FROM collab_message_reactions cmr
    JOIN collab_messages cm ON cm.id = cmr.message_id
    WHERE cm.trip_id IN (${placeholders})
  `).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getTripMembers(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM trip_members WHERE trip_id IN (${placeholders})`).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getShareTokens(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM share_tokens WHERE trip_id IN (${placeholders})`).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getTripCollabTokens(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM trip_collab_tokens WHERE trip_id IN (${placeholders})`).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getDayNotes(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM day_notes WHERE trip_id IN (${placeholders})`).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getDayAccommodations(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM day_accommodations WHERE trip_id IN (${placeholders})`).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getFileLinks(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`
    SELECT fl.* FROM file_links fl
    JOIN trip_files tf ON tf.id = fl.file_id
    WHERE tf.trip_id IN (${placeholders})
  `).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getPhotos(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM photos WHERE trip_id IN (${placeholders})`).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getTripFiles(tripIds: string[]): Array<Record<string, unknown>> {
  if (tripIds.length === 0) return [];
  const placeholders = tripIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM trip_files WHERE trip_id IN (${placeholders}) AND deleted_at IS NULL`).all(...tripIds) as Array<Record<string, unknown>>;
}

export function getUsers(userIds?: string[]): Array<Record<string, unknown>> {
  // Never export password hashes, MFA secrets, or tokens
  const columns = [
    'id', 'username', 'email', 'role', 'avatar', 'maps_api_key',
    'unsplash_api_key', 'openweather_api_key', 'immich_url',
    'mfa_enabled', 'must_change_password', 'creator_auto_approved',
    'creator_fee_percent', 'last_login', 'created_at', 'updated_at'
  ];
  const selectCols = columns.join(', ');
  if (userIds && userIds.length > 0) {
    const placeholders = userIds.map(() => '?').join(',');
    return db.prepare(`SELECT ${selectCols} FROM users WHERE id IN (${placeholders})`).all(...userIds) as Array<Record<string, unknown>>;
  }
  return db.prepare(`SELECT ${selectCols} FROM users`).all() as Array<Record<string, unknown>>;
}

export function getUserSettings(userIds?: string[]): Array<Record<string, unknown>> {
  if (userIds && userIds.length > 0) {
    const placeholders = userIds.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM settings WHERE user_id IN (${placeholders})`).all(...userIds) as Array<Record<string, unknown>>;
  }
  return db.prepare('SELECT * FROM settings').all() as Array<Record<string, unknown>>;
}

export function getAppSettings(): Array<Record<string, unknown>> {
  return db.prepare('SELECT * FROM app_settings').all() as Array<Record<string, unknown>>;
}

export function getAddons(): Array<Record<string, unknown>> {
  return db.prepare('SELECT * FROM addons').all() as Array<Record<string, unknown>>;
}

export function getExploreData(userIds?: string[]): {
  listings: Array<Record<string, unknown>>;
  purchases: Array<Record<string, unknown>>;
  reviews: Array<Record<string, unknown>>;
} {
  let listings: Array<Record<string, unknown>> = [];
  let purchases: Array<Record<string, unknown>> = [];
  let reviews: Array<Record<string, unknown>> = [];

  if (userIds && userIds.length > 0) {
    const placeholders = userIds.map(() => '?').join(',');
    listings = db.prepare(`SELECT * FROM explore_published WHERE user_id IN (${placeholders})`).all(...userIds) as Array<Record<string, unknown>>;
    purchases = db.prepare(`SELECT * FROM explore_user_trips WHERE user_id IN (${placeholders})`).all(...userIds) as Array<Record<string, unknown>>;
    reviews = db.prepare(`SELECT * FROM explore_reviews WHERE user_id IN (${placeholders})`).all(...userIds) as Array<Record<string, unknown>>;
  } else {
    listings = db.prepare('SELECT * FROM explore_published').all() as Array<Record<string, unknown>>;
    purchases = db.prepare('SELECT * FROM explore_user_trips').all() as Array<Record<string, unknown>>;
    reviews = db.prepare('SELECT * FROM explore_reviews').all() as Array<Record<string, unknown>>;
  }

  return { listings, purchases, reviews };
}
