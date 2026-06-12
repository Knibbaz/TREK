import { db } from '../../db/database';

export type ConflictStrategy = 'skip' | 'overwrite' | 'duplicate' | 'merge';

export interface ConflictReport {
  table: string;
  conflicts: number;
  details: Array<{
    id: string;
    exists: boolean;
    newer?: boolean;
  }>;
}

export interface IdMap {
  [oldId: string]: string;
}

export function generateNewId(): string {
  // Same pattern as the DB: lower(hex(randomblob(8)))
  const buf = Buffer.allocUnsafe(8);
  for (let i = 0; i < 8; i++) buf[i] = Math.floor(Math.random() * 256);
  return buf.toString('hex').toLowerCase();
}

export function detectConflicts(
  tableName: string,
  rows: Array<Record<string, unknown>>
): ConflictReport {
  if (rows.length === 0) {
    return { table: tableName, conflicts: 0, details: [] };
  }

  const idField = tableName === 'app_settings' ? 'key' : 'id';
  const ids = rows.map(r => String(r[idField])).filter(Boolean);
  if (ids.length === 0) {
    return { table: tableName, conflicts: 0, details: [] };
  }

  const placeholders = ids.map(() => '?').join(',');
  let existingIds: Set<string>;

  try {
    const results = db.prepare(`SELECT ${idField} FROM ${tableName} WHERE ${idField} IN (${placeholders})`).all(...ids) as Array<Record<string, string>>;
    existingIds = new Set(results.map(r => String(r[idField])));
  } catch {
    // Table might not exist in target
    existingIds = new Set();
  }

  const details: ConflictReport['details'] = [];
  for (const row of rows) {
    const id = String(row[idField]);
    if (!id) continue;
    const exists = existingIds.has(id);
    let newer = false;
    if (exists && row.updated_at) {
      try {
        const existing = db.prepare(`SELECT updated_at FROM ${tableName} WHERE ${idField} = ?`).get(id) as { updated_at: string } | undefined;
        if (existing) {
          newer = new Date(String(row.updated_at)) > new Date(existing.updated_at);
        }
      } catch { /* ignore */ }
    }
    details.push({ id, exists, newer });
  }

  return {
    table: tableName,
    conflicts: details.filter(d => d.exists).length,
    details,
  };
}

export function buildIdMap(
  tableName: string,
  rows: Array<Record<string, unknown>>
): IdMap {
  const idMap: IdMap = {};
  const idField = tableName === 'app_settings' ? 'key' : 'id';
  for (const row of rows) {
    const oldId = String(row[idField]);
    if (oldId) {
      idMap[oldId] = generateNewId();
    }
  }
  return idMap;
}

export function remapIds(
  rows: Array<Record<string, unknown>>,
  idMaps: Record<string, IdMap>,
  options?: {
    tableName: string;
    strategy: ConflictStrategy;
  }
): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const newRow = { ...row };

    // Remap the row's own ID if strategy is duplicate
    if (options?.strategy === 'duplicate') {
      const idField = options.tableName === 'app_settings' ? 'key' : 'id';
      const ownMap = idMaps[options.tableName];
      if (ownMap && newRow[idField]) {
        newRow[idField] = ownMap[String(newRow[idField])];
      }
    }

    // Remap foreign key references
    for (const [key, value] of Object.entries(newRow)) {
      if (value === null || value === undefined) continue;

      // Common FK patterns
      const fkMap: Record<string, string> = {
        trip_id: 'trips',
        day_id: 'days',
        place_id: 'places',
        user_id: 'users',
        budget_item_id: 'budget_items',
        reservation_id: 'reservations',
        bag_id: 'packing_bags',
        template_id: 'packing_templates',
        category_id: 'packing_template_categories',
        list_id: 'lists',
        poll_id: 'collab_polls',
        message_id: 'collab_messages',
        file_id: 'trip_files',
        tag_id: 'tags',
        assignment_id: 'day_assignments',
        end_day_id: 'days',
        start_day_id: 'days',
        accommodation_id: 'places',
        invited_by: 'users',
        created_by: 'users',
        uploaded_by: 'users',
        paid_by_user_id: 'users',
        assigned_user_id: 'users',
      };

      const targetTable = fkMap[key];
      if (targetTable && idMaps[targetTable]) {
        const strValue = String(value);
        if (idMaps[targetTable][strValue]) {
          newRow[key] = idMaps[targetTable][strValue];
        }
      }
    }

    result.push(newRow);
  }

  return result;
}

export function shouldImportRow(
  row: Record<string, unknown>,
  tableName: string,
  strategy: ConflictStrategy,
  idMap?: IdMap
): boolean {
  if (strategy === 'duplicate') {
    return true; // Always import with new IDs
  }

  const idField = tableName === 'app_settings' ? 'key' : 'id';
  const id = String(row[idField]);
  if (!id) return true;

  if (strategy === 'skip') {
    try {
      const existing = db.prepare(`SELECT 1 FROM ${tableName} WHERE ${idField} = ?`).get(id);
      return !existing;
    } catch {
      return true;
    }
  }

  if (strategy === 'merge') {
    try {
      const existing = db.prepare(`SELECT updated_at FROM ${tableName} WHERE ${idField} = ?`).get(id) as { updated_at: string } | undefined;
      if (!existing) return true;
      const importUpdated = row.updated_at ? new Date(String(row.updated_at)) : new Date(0);
      const existingUpdated = new Date(existing.updated_at);
      return importUpdated > existingUpdated;
    } catch {
      return true;
    }
  }

  // overwrite: always import
  return true;
}
