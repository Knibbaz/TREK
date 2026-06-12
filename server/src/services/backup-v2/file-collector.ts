import fs from 'fs';
import path from 'path';
import { db } from '../../db/database';

const uploadsDir = path.join(__dirname, '../../../uploads');

export interface CollectedFile {
  sourcePath: string;
  archivePath: string;
}

export function collectTripFiles(tripIds: string[]): CollectedFile[] {
  const files: CollectedFile[] = [];
  if (tripIds.length === 0) return files;

  const placeholders = tripIds.map(() => '?').join(',');

  // Trip cover images
  const trips = db.prepare(`SELECT id, cover_image FROM trips WHERE id IN (${placeholders}) AND cover_image IS NOT NULL`).all(...tripIds) as { id: string; cover_image: string }[];
  for (const t of trips) {
    const src = path.join(uploadsDir, 'covers', t.cover_image);
    if (fs.existsSync(src)) {
      files.push({ sourcePath: src, archivePath: `uploads/covers/${t.cover_image}` });
    }
  }

  // Photos
  const photos = db.prepare(`SELECT filename FROM photos WHERE trip_id IN (${placeholders}) AND filename IS NOT NULL`).all(...tripIds) as { filename: string }[];
  for (const p of photos) {
    const src = path.join(uploadsDir, 'photos', p.filename);
    if (fs.existsSync(src)) {
      files.push({ sourcePath: src, archivePath: `uploads/photos/${p.filename}` });
    }
  }

  // Trip files/documents
  const tripFiles = db.prepare(`SELECT filename FROM trip_files WHERE trip_id IN (${placeholders}) AND filename IS NOT NULL AND deleted_at IS NULL`).all(...tripIds) as { filename: string }[];
  for (const f of tripFiles) {
    const src = path.join(uploadsDir, 'files', f.filename);
    if (fs.existsSync(src)) {
      files.push({ sourcePath: src, archivePath: `uploads/files/${f.filename}` });
    }
  }

  return files;
}

export function collectUserFiles(userIds: string[]): CollectedFile[] {
  const files: CollectedFile[] = [];
  if (userIds.length === 0) return files;

  const placeholders = userIds.map(() => '?').join(',');

  // User avatars
  const users = db.prepare(`SELECT id, avatar FROM users WHERE id IN (${placeholders}) AND avatar IS NOT NULL`).all(...userIds) as { id: string; avatar: string }[];
  for (const u of users) {
    const src = path.join(uploadsDir, 'avatars', u.avatar);
    if (fs.existsSync(src)) {
      files.push({ sourcePath: src, archivePath: `uploads/avatars/${u.avatar}` });
    }
  }

  return files;
}

export function collectAllUploadFiles(): CollectedFile[] {
  const files: CollectedFile[] = [];
  const subdirs = ['avatars', 'covers', 'files', 'photos', 'journey', 'place-photos'];
  for (const subdir of subdirs) {
    const dir = path.join(uploadsDir, subdir);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      const src = path.join(dir, file);
      if (fs.statSync(src).isFile()) {
        files.push({ sourcePath: src, archivePath: `uploads/${subdir}/${file}` });
      }
    }
  }
  return files;
}

export function collectFilesForScope(opts: {
  tripIds?: string[];
  userIds?: string[];
  includeUploads?: boolean;
}): CollectedFile[] {
  const files: CollectedFile[] = [];
  const seen = new Set<string>();

  const add = (f: CollectedFile) => {
    if (!seen.has(f.sourcePath)) {
      seen.add(f.sourcePath);
      files.push(f);
    }
  };

  if (opts.tripIds && opts.tripIds.length > 0) {
    collectTripFiles(opts.tripIds).forEach(add);
  }

  if (opts.userIds && opts.userIds.length > 0) {
    collectUserFiles(opts.userIds).forEach(add);
  }

  if (opts.includeUploads) {
    collectAllUploadFiles().forEach(add);
  }

  return files;
}
