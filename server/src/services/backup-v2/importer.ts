import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';
import { db } from '../../db/database';
import { validateManifest, checkVersionCompatibility, type TrekManifest } from './manifest';
import { verifyChecksums } from './checksum';
import { detectConflicts, buildIdMap, remapIds, shouldImportRow, type ConflictStrategy, type ConflictReport, type IdMap } from './resolver';
import { sha256File } from './checksum';

const packageJson = require('../../../package.json');
const CURRENT_VERSION = packageJson.version || '3.0.0';
const uploadsDir = path.join(__dirname, '../../../uploads');

export interface ImportPreview {
  manifest: TrekManifest;
  versionWarning?: string;
  checksumValid: boolean;
  conflicts: ConflictReport[];
  totalRows: number;
}

export interface ImportResult {
  success: boolean;
  imported: Record<string, number>;
  skipped: Record<string, number>;
  errors: string[];
}

const DATA_TABLES = [
  'trips', 'days', 'places', 'day_assignments',
  'budget_items', 'budget_item_members', 'budget_category_order',
  'reservations', 'reservation_endpoints', 'reservation_day_positions',
  'packing_items', 'packing_bags', 'packing_bag_members', 'packing_category_assignees',
  'packing_templates', 'packing_template_categories', 'packing_template_items',
  'todo_items', 'todo_category_assignees',
  'lists', 'list_items', 'notes', 'documents',
  'tags', 'place_tags', 'categories',
  'collab_notes', 'collab_polls', 'collab_poll_votes',
  'collab_messages', 'collab_message_reactions',
  'trip_members', 'share_tokens', 'trip_collab_tokens',
  'day_notes', 'day_accommodations', 'file_links',
  'photos', 'trip_files',
  'users', 'user_settings', 'app_settings', 'addons',
  'explore_listings', 'explore_purchases', 'explore_reviews',
];

export async function extractTrek(trekPath: string): Promise<{
  extractDir: string;
  manifest: TrekManifest;
}> {
  const extractDir = path.join(path.dirname(trekPath), `extract-${Date.now()}`);
  fs.mkdirSync(extractDir, { recursive: true });

  await fs.createReadStream(trekPath)
    .pipe(unzipper.Extract({ path: extractDir }))
    .promise();

  const manifestPath = path.join(extractDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    fs.rmSync(extractDir, { recursive: true, force: true });
    throw new Error('Invalid .trek file: manifest.json not found');
  }

  const manifestRaw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const validation = validateManifest(manifestRaw);
  if (!validation.valid) {
    fs.rmSync(extractDir, { recursive: true, force: true });
    throw new Error(`Invalid manifest: ${(validation as { valid: false; error: string }).error}`);
  }

  return { extractDir, manifest: validation.manifest };
}

export async function validateTrek(trekPath: string): Promise<{
  valid: boolean;
  manifest: TrekManifest;
  extractDir: string;
  error?: string;
  versionWarning?: string;
}> {
  try {
    const { extractDir, manifest } = await extractTrek(trekPath);

    const versionCheck = checkVersionCompatibility(manifest.trek_version, CURRENT_VERSION);

    // Verify checksums if present
    const checksumsPath = path.join(extractDir, 'checksums.json');
    if (fs.existsSync(checksumsPath)) {
      const checksums = JSON.parse(fs.readFileSync(checksumsPath, 'utf8'));
      const verification = verifyChecksums(extractDir, checksums);
      if (!verification.valid) {
        return { valid: false, manifest, extractDir, error: `Checksum verification failed: ${verification.mismatches.join(', ')}` };
      }
    }

    return {
      valid: true,
      manifest,
      extractDir,
      versionWarning: versionCheck.warning,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, manifest: msg as unknown as TrekManifest, extractDir: '', error: msg };
  }
}

export function buildImportPreview(extractDir: string, manifest: TrekManifest): ImportPreview {
  const conflicts: ConflictReport[] = [];
  let totalRows = 0;

  for (const table of DATA_TABLES) {
    const filePath = path.join(extractDir, 'data', `${table}.json`);
    if (!fs.existsSync(filePath)) continue;
    const rows = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Array<Record<string, unknown>>;
    totalRows += rows.length;
    const report = detectConflicts(table, rows);
    if (report.conflicts > 0) {
      conflicts.push(report);
    }
  }

  const checksumsPath = path.join(extractDir, 'checksums.json');
  let checksumValid = true;
  if (fs.existsSync(checksumsPath)) {
    const checksums = JSON.parse(fs.readFileSync(checksumsPath, 'utf8'));
    const verification = verifyChecksums(extractDir, checksums);
    checksumValid = verification.valid;
  }

  const versionCheck = checkVersionCompatibility(manifest.trek_version, CURRENT_VERSION);

  return {
    manifest,
    versionWarning: versionCheck.warning,
    checksumValid,
    conflicts,
    totalRows,
  };
}

export function importFromTrek(
  extractDir: string,
  manifest: TrekManifest,
  strategy: ConflictStrategy,
  scopes?: string[],
  dryRun = false
): ImportResult {
  const result: ImportResult = {
    success: true,
    imported: {},
    skipped: {},
    errors: [],
  };

  const idMaps: Record<string, IdMap> = {};

  // Build ID maps for duplicate strategy
  if (strategy === 'duplicate') {
    for (const table of DATA_TABLES) {
      const filePath = path.join(extractDir, 'data', `${table}.json`);
      if (!fs.existsSync(filePath)) continue;
      const rows = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Array<Record<string, unknown>>;
      if (rows.length > 0) {
        idMaps[table] = buildIdMap(table, rows);
      }
    }
  }

  // Determine which tables to import based on scope
  const tablesToImport: string[] = [];
  for (const table of DATA_TABLES) {
    if (scopes && scopes.length > 0 && !scopes.includes(table)) continue;

    // Skip admin-only tables for user imports
    if (manifest.export_type === 'user_export') {
      const adminOnlyTables = ['users', 'app_settings', 'addons', 'categories', 'packing_templates', 'packing_template_categories', 'packing_template_items'];
      if (adminOnlyTables.includes(table)) continue;
    }

    tablesToImport.push(table);
  }

  // Import tables in dependency order
  const importOrder = [
    'users', 'user_settings', 'app_settings', 'addons', 'categories',
    'packing_templates', 'packing_template_categories', 'packing_template_items',
    'tags', 'trips', 'days', 'places', 'day_assignments',
    'budget_items', 'budget_item_members', 'budget_category_order',
    'reservations', 'reservation_endpoints', 'reservation_day_positions',
    'packing_bags', 'packing_items', 'packing_bag_members', 'packing_category_assignees',
    'todo_items', 'todo_category_assignees',
    'lists', 'list_items', 'notes', 'documents',
    'place_tags', 'collab_notes', 'collab_polls', 'collab_poll_votes',
    'collab_messages', 'collab_message_reactions',
    'trip_members', 'share_tokens', 'trip_collab_tokens',
    'day_notes', 'day_accommodations', 'file_links',
    'photos', 'trip_files',
    'explore_listings', 'explore_purchases', 'explore_reviews',
  ];

  for (const table of importOrder) {
    if (!tablesToImport.includes(table)) continue;

    const filePath = path.join(extractDir, 'data', `${table}.json`);
    if (!fs.existsSync(filePath)) continue;

    let rows: Array<Record<string, unknown>>;
    try {
      rows = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Array<Record<string, unknown>>;
    } catch {
      result.errors.push(`Failed to parse ${table}.json`);
      continue;
    }

    if (rows.length === 0) continue;

    // Remap IDs for duplicate strategy
    if (strategy === 'duplicate') {
      rows = remapIds(rows, idMaps, { tableName: table, strategy });
    }

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      if (!shouldImportRow(row, table, strategy)) {
        skipped++;
        continue;
      }

      if (dryRun) {
        imported++;
        continue;
      }

      try {
        insertRow(table, row);
        imported++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // Log but don't fail the whole import for single row errors
        result.errors.push(`Failed to import row in ${table}: ${msg}`);
        skipped++;
      }
    }

    result.imported[table] = imported;
    result.skipped[table] = skipped;
  }

  // Copy upload files
  if (!dryRun && manifest.scope.uploads !== false) {
    const uploadsSource = path.join(extractDir, 'uploads');
    if (fs.existsSync(uploadsSource)) {
      for (const subdir of fs.readdirSync(uploadsSource)) {
        const srcDir = path.join(uploadsSource, subdir);
        if (!fs.statSync(srcDir).isDirectory()) continue;
        const destDir = path.join(uploadsDir, subdir);
        fs.mkdirSync(destDir, { recursive: true });
        for (const file of fs.readdirSync(srcDir)) {
          const src = path.join(srcDir, file);
          const dest = path.join(destDir, file);
          if (fs.existsSync(dest)) {
            // For skip strategy, don't overwrite existing files
            if (strategy === 'skip') continue;
          }
          fs.copyFileSync(src, dest);
        }
      }
    }
  }

  return result;
}

function insertRow(tableName: string, row: Record<string, unknown>): void {
  const columns = Object.keys(row);
  if (columns.length === 0) return;

  const values = columns.map(c => row[c]);
  const colNames = columns.join(', ');
  const placeholders = columns.map(() => '?').join(', ');

  const stmt = db.prepare(`INSERT OR REPLACE INTO ${tableName} (${colNames}) VALUES (${placeholders})`);
  stmt.run(...values);
}

export function cleanupExtractDir(extractDir: string): void {
  try {
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  } catch (e) {
    console.error('[backup-v2] Failed to cleanup extract dir:', e);
  }
}
