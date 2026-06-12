import Database from 'better-sqlite3';

export type EntityType = 'place' | 'day' | 'budget_item' | 'reservation' | 'note';
export type DeltaAction = 'added' | 'removed' | 'modified';

export interface DeltaRecord {
  id: number;
  user_trip_id: number;
  entity_type: EntityType;
  entity_id: number;
  action: DeltaAction;
  original_data: string | null;
  modified_data: string | null;
  created_at: string;
}

/**
 * Track a mutation on a forked trip.
 * Used when a user modifies their imported/forked trip content.
 */
export function trackDelta(
  db: Database.Database,
  userTripId: number,
  entityType: EntityType,
  entityId: number,
  action: DeltaAction,
  originalData?: any,
  modifiedData?: any
): void {
  try {
    db.prepare(`
      INSERT INTO explore_fork_deltas (user_trip_id, entity_type, entity_id, action, original_data, modified_data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      userTripId,
      entityType,
      entityId,
      action,
      originalData ? JSON.stringify(originalData) : null,
      modifiedData ? JSON.stringify(modifiedData) : null
    );
  } catch (err) {
    console.error('[deltaTracking] Failed to track delta:', err);
  }
}

/**
 * Get all deltas for a forked trip grouped by entity type.
 */
export function getDeltas(
  db: Database.Database,
  userTripId: number
): { [key in EntityType]?: DeltaRecord[] } {
  const deltas = db.prepare(`
    SELECT * FROM explore_fork_deltas
    WHERE user_trip_id = ?
    ORDER BY entity_type, created_at ASC
  `).all(userTripId) as DeltaRecord[];

  const grouped: { [key in EntityType]?: DeltaRecord[] } = {};
  for (const delta of deltas) {
    if (!grouped[delta.entity_type]) {
      grouped[delta.entity_type] = [];
    }
    grouped[delta.entity_type]!.push(delta);
  }
  return grouped;
}

/**
 * Get summary of changes: count by action type.
 */
export function getDeltaSummary(
  db: Database.Database,
  userTripId: number
): { added: number; removed: number; modified: number } {
  const result = db.prepare(`
    SELECT
      SUM(CASE WHEN action = 'added' THEN 1 ELSE 0 END) as added,
      SUM(CASE WHEN action = 'removed' THEN 1 ELSE 0 END) as removed,
      SUM(CASE WHEN action = 'modified' THEN 1 ELSE 0 END) as modified
    FROM explore_fork_deltas
    WHERE user_trip_id = ?
  `).get(userTripId) as { added: number; removed: number; modified: number } | undefined;

  return result ? {
    added: result.added || 0,
    removed: result.removed || 0,
    modified: result.modified || 0,
  } : { added: 0, removed: 0, modified: 0 };
}

/**
 * Get entities that conflict between creator updates and user changes.
 * Returns entities modified by both creator and user.
 */
export function getConflictingEntities(
  db: Database.Database,
  userTripId: number,
  creatorChangedEntities: Array<{ type: EntityType; id: number }>
): DeltaRecord[] {
  if (creatorChangedEntities.length === 0) return [];

  const userDeltas = getDeltas(db, userTripId);
  const conflicts: DeltaRecord[] = [];

  for (const creatorChange of creatorChangedEntities) {
    const userChanges = userDeltas[creatorChange.type] || [];
    const conflict = userChanges.find(d => d.entity_id === creatorChange.id);
    if (conflict) {
      conflicts.push(conflict);
    }
  }

  return conflicts;
}

/**
 * Clear all deltas for a user trip (called after sync is applied).
 */
export function clearDeltas(db: Database.Database, userTripId: number): void {
  db.prepare('DELETE FROM explore_fork_deltas WHERE user_trip_id = ?').run(userTripId);
}

/**
 * Helper: Track place addition in a forked trip.
 */
export function trackPlaceAdded(
  db: Database.Database,
  tripId: number,
  placeId: number,
  placeData: any
): void {
  const link = db.prepare('SELECT id FROM explore_user_trips WHERE trip_id = ?').get(tripId) as { id: number } | undefined;
  if (!link) return; // Not a forked trip

  trackDelta(db, link.id, 'place', placeId, 'added', undefined, placeData);
}

/**
 * Helper: Track place modification in a forked trip.
 */
export function trackPlaceModified(
  db: Database.Database,
  tripId: number,
  placeId: number,
  originalData: any,
  modifiedData: any
): void {
  const link = db.prepare('SELECT id FROM explore_user_trips WHERE trip_id = ?').get(tripId) as { id: number } | undefined;
  if (!link) return; // Not a forked trip

  trackDelta(db, link.id, 'place', placeId, 'modified', originalData, modifiedData);
}

/**
 * Helper: Track place removal from a forked trip.
 */
export function trackPlaceRemoved(
  db: Database.Database,
  tripId: number,
  placeId: number,
  placeData: any
): void {
  const link = db.prepare('SELECT id FROM explore_user_trips WHERE trip_id = ?').get(tripId) as { id: number } | undefined;
  if (!link) return; // Not a forked trip

  trackDelta(db, link.id, 'place', placeId, 'removed', placeData, undefined);
}
