import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { db } from '../../db/database';
import { generateManifest, type TrekManifest, type ManifestScope, type ManifestFilters, type ManifestStats } from './manifest';
import { computeChecksums, sha256String } from './checksum';
import { collectFilesForScope, type CollectedFile } from './file-collector';
import * as scopeBuilder from './scope-builder';

const packageJson = require('../../../package.json');
const TREK_VERSION = packageJson.version || '3.0.0';

const dataDir = path.join(__dirname, '../../../data');
const exportsDir = path.join(dataDir, 'exports');
const backupsDir = path.join(dataDir, 'backups-v2');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export interface ExportResult {
  id: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  checksum: string;
  manifest: TrekManifest;
}

export interface ExportOptions {
  id: string;
  exportType: TrekManifest['export_type'];
  scope: ManifestScope;
  filters?: ManifestFilters;
  userId?: string;
  userRole?: string;
  initiatedBy?: string;
}

export async function runExport(opts: ExportOptions): Promise<ExportResult> {
  ensureDir(exportsDir);
  ensureDir(backupsDir);

  const isUserExport = opts.exportType === 'user_export';
  const targetDir = isUserExport ? exportsDir : backupsDir;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `${opts.exportType}-${opts.id}-${timestamp}.routd`;
  const filePath = path.join(targetDir, fileName);

  const archive = archiver('zip', { zlib: { level: 6 } });
  const output = fs.createWriteStream(filePath);

  let manifest: ReturnType<typeof generateManifest> | undefined;
  await new Promise<void>((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);

    // Collect data
    const dataEntries: Record<string, Array<Record<string, unknown>>> = {};
    const stats: ManifestStats = {};
    let tripIds: string[] = [];
    let userIds: string[] = [];

    if (opts.scope.trips && !isUserExport) {
      const trips = scopeBuilder.getTrips(opts.filters || {});
      dataEntries['trips'] = trips;
      tripIds = trips.map(t => String(t.id));
      stats.trips = trips.length;
    } else if (isUserExport && opts.userId) {
      const trips = scopeBuilder.getTripsForUser(opts.userId);
      dataEntries['trips'] = trips;
      tripIds = trips.map(t => String(t.id));
      stats.trips = trips.length;
    }

    if (tripIds.length > 0) {
      dataEntries['days'] = scopeBuilder.getDays(tripIds);
      dataEntries['places'] = scopeBuilder.getPlaces(tripIds);
      dataEntries['day_assignments'] = scopeBuilder.getDayAssignments(tripIds);
      dataEntries['budget_items'] = scopeBuilder.getBudgetItems(tripIds);
      dataEntries['budget_item_members'] = scopeBuilder.getBudgetItemMembers(tripIds);
      dataEntries['reservations'] = scopeBuilder.getReservations(tripIds);
      dataEntries['reservation_endpoints'] = scopeBuilder.getReservationEndpoints(tripIds);
      dataEntries['reservation_day_positions'] = scopeBuilder.getReservationDayPositions(tripIds);
      dataEntries['packing_items'] = scopeBuilder.getPackingItems(tripIds);
      dataEntries['packing_bags'] = scopeBuilder.getPackingBags(tripIds);
      dataEntries['packing_bag_members'] = scopeBuilder.getPackingBagMembers(tripIds);
      dataEntries['packing_category_assignees'] = scopeBuilder.getPackingCategoryAssignees(tripIds);
      dataEntries['todo_items'] = scopeBuilder.getTodoItems(tripIds);
      dataEntries['todo_category_assignees'] = scopeBuilder.getTodoCategoryAssignees(tripIds);
      dataEntries['lists'] = scopeBuilder.getLists(tripIds);
      dataEntries['list_items'] = scopeBuilder.getListItems(tripIds);
      dataEntries['notes'] = scopeBuilder.getNotes(tripIds);
      dataEntries['documents'] = scopeBuilder.getDocuments(tripIds);
      dataEntries['tags'] = scopeBuilder.getTags(isUserExport && opts.userId ? [opts.userId] : undefined);
      dataEntries['place_tags'] = scopeBuilder.getPlaceTags(tripIds);
      dataEntries['collab_notes'] = scopeBuilder.getCollabNotes(tripIds);
      dataEntries['collab_polls'] = scopeBuilder.getCollabPolls(tripIds);
      dataEntries['collab_poll_votes'] = scopeBuilder.getCollabPollVotes(tripIds);
      dataEntries['collab_messages'] = scopeBuilder.getCollabMessages(tripIds);
      dataEntries['collab_message_reactions'] = scopeBuilder.getCollabMessageReactions(tripIds);
      dataEntries['trip_members'] = scopeBuilder.getTripMembers(tripIds);
      dataEntries['share_tokens'] = scopeBuilder.getShareTokens(tripIds);
      dataEntries['trip_collab_tokens'] = scopeBuilder.getTripCollabTokens(tripIds);
      dataEntries['day_notes'] = scopeBuilder.getDayNotes(tripIds);
      dataEntries['day_accommodations'] = scopeBuilder.getDayAccommodations(tripIds);
      dataEntries['file_links'] = scopeBuilder.getFileLinks(tripIds);
      dataEntries['photos'] = scopeBuilder.getPhotos(tripIds);
      dataEntries['trip_files'] = scopeBuilder.getTripFiles(tripIds);
      dataEntries['budget_category_order'] = scopeBuilder.getBudgetItems(tripIds).length > 0
        ? db.prepare(`SELECT * FROM budget_category_order WHERE trip_id IN (${tripIds.map(() => '?').join(',')})`).all(...tripIds) as Array<Record<string, unknown>>
        : [];

      stats.places = dataEntries['places'].length;
      stats.budget_items = dataEntries['budget_items'].length;
      stats.reservations = dataEntries['reservations'].length;
    }

    // Users scope (admin only, or user export for self)
    if (opts.scope.users) {
      if (isUserExport && opts.userId) {
        userIds = [opts.userId];
      } else if (opts.filters?.user_ids) {
        userIds = opts.filters.user_ids;
      }
      dataEntries['users'] = scopeBuilder.getUsers(userIds.length > 0 ? userIds : undefined);
      dataEntries['user_settings'] = scopeBuilder.getUserSettings(userIds.length > 0 ? userIds : undefined);
    } else if (isUserExport && opts.userId) {
      // User export always includes their own profile
      dataEntries['users'] = scopeBuilder.getUsers([opts.userId]);
      dataEntries['user_settings'] = scopeBuilder.getUserSettings([opts.userId]);
    }

    // Settings scope (admin only)
    if (opts.scope.settings && !isUserExport) {
      dataEntries['app_settings'] = scopeBuilder.getAppSettings();
      dataEntries['categories'] = scopeBuilder.getCategories();
      dataEntries['packing_templates'] = scopeBuilder.getPackingTemplates();
      dataEntries['packing_template_categories'] = scopeBuilder.getPackingTemplateCategories();
      dataEntries['packing_template_items'] = scopeBuilder.getPackingTemplateItems();
      dataEntries['addons'] = scopeBuilder.getAddons();
    }

    // Explore scope
    if (opts.scope.explore) {
      const exploreData = scopeBuilder.getExploreData(isUserExport && opts.userId ? [opts.userId] : undefined);
      dataEntries['explore_listings'] = exploreData.listings;
      dataEntries['explore_purchases'] = exploreData.purchases;
      dataEntries['explore_reviews'] = exploreData.reviews;
    }

    // Write data JSON files
    for (const [key, rows] of Object.entries(dataEntries)) {
      if (rows.length === 0) continue;
      stats[key] = rows.length;
      archive.append(JSON.stringify(rows, null, 2), { name: `data/${key}.json` });
    }

    // Collect and write upload files
    let files: CollectedFile[] = [];
    if (opts.scope.uploads !== false) {
      const fileOpts: { tripIds?: string[]; userIds?: string[]; includeUploads?: boolean } = {};
      if (tripIds.length > 0) fileOpts.tripIds = tripIds;
      if (userIds.length > 0) fileOpts.userIds = userIds;
      if (opts.scope.uploads === true) fileOpts.includeUploads = true;
      files = collectFilesForScope(fileOpts);
    }

    for (const file of files) {
      archive.file(file.sourcePath, { name: file.archivePath });
    }
    stats.files = files.length;

    // Generate manifest
    manifest = generateManifest({
      trekVersion: TREK_VERSION,
      exportType: opts.exportType,
      scope: opts.scope,
      filters: opts.filters || {},
      stats,
      exportedBy: {
        user_id: opts.initiatedBy || 'system',
        role: opts.userRole || 'system',
      },
    });
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    // Finalize
    archive.finalize();
  });

  // Compute checksum of the archive
  const { sha256File } = require('./checksum');
  const checksum = await sha256File(filePath);
  const stat = fs.statSync(filePath);

  return {
    id: opts.id,
    filePath,
    fileName,
    fileSize: stat.size,
    checksum,
    manifest: manifest!,
  };
}

export function deleteExportFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.error('[backup-v2] Failed to delete export file:', e);
  }
}
