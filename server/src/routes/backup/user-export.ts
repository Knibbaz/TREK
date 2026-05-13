import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { authenticate } from '../../middleware/auth';
import { AuthRequest } from '../../types';
import { db } from '../../db/database';
import { runExport, deleteExportFile } from '../../services/backup-v2/exporter';
import { validateTrek, importFromTrek, cleanupExtractDir } from '../../services/backup-v2/importer';
import { writeAudit, getClientIp } from '../../services/auditLog';

const router = express.Router();

const exportsDir = path.join(__dirname, '../../../data/exports');
const uploadsDir = path.join(__dirname, '../../../data/uploads-v2');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const importUpload = multer({
  dest: uploadsDir,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith('.trek')) cb(null, true);
    else cb(new Error('Only .trek files allowed'));
  },
});

// Rate limiter: max 1 export per user per 24 hours
const exportAttempts = new Map<string, { count: number; first: number }>();
const EXPORT_WINDOW = 24 * 60 * 60 * 1000; // 24 hours

function checkExportRateLimit(userId: string): boolean {
  const now = Date.now();
  const record = exportAttempts.get(userId);
  if (record && record.count >= 1 && now - record.first < EXPORT_WINDOW) {
    return false;
  }
  if (!record || now - record.first >= EXPORT_WINDOW) {
    exportAttempts.set(userId, { count: 1, first: now });
  } else {
    record.count++;
  }
  return true;
}

// Generate cryptographically random token
function generateToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// POST /api/user/export — start async export for logged-in user
router.post('/export', authenticate, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user.id;

    // Check if there's already a pending/completed export
    const existing = db.prepare(`
      SELECT id, status, file_path, expires_at FROM gdpr_export_requests
      WHERE user_id = ? AND status IN ('pending', 'processing', 'ready')
      ORDER BY requested_at DESC LIMIT 1
    `).get(userId) as { id: string; status: string; file_path: string | null; expires_at: string | null } | undefined;

    if (existing) {
      if (existing.status === 'pending' || existing.status === 'processing') {
        return res.status(409).json({ error: 'An export is already in progress', exportId: existing.id });
      }
      if (existing.status === 'ready' && existing.file_path && fs.existsSync(existing.file_path)) {
        return res.json({
          success: true,
          exportId: existing.id,
          status: existing.status,
          message: 'Export already ready for download',
        });
      }
    }

    // Rate limit check
    if (!checkExportRateLimit(userId)) {
      return res.status(429).json({ error: 'You can only request one export per 24 hours.' });
    }

    // Create DB record
    const exportId = (db.prepare(`
      INSERT INTO gdpr_export_requests (user_id, status)
      VALUES (?, 'pending')
      RETURNING id
    `).get(userId) as { id: string }).id;

    // Audit log export request
    writeAudit({
      userId,
      action: 'gdpr.export_requested',
      resource: exportId,
      ip: getClientIp(req),
    });

    // Update to processing
    db.prepare("UPDATE gdpr_export_requests SET status = 'processing' WHERE id = ?").run(exportId);

    // Run export synchronously (acceptable for MVP)
    const result = await runExport({
      id: exportId,
      exportType: 'user_export',
      scope: { trips: true, uploads: true },
      userId,
      userRole: authReq.user.role,
      initiatedBy: userId,
    });

    // Generate download token
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    // Update DB record
    db.prepare(`
      UPDATE gdpr_export_requests
      SET status = 'ready',
          file_path = ?,
          file_size_bytes = ?,
          download_token = ?,
          expires_at = ?,
          ready_at = datetime('now')
      WHERE id = ?
    `).run(result.filePath, result.fileSize, token, expiresAt, exportId);

    res.json({
      success: true,
      exportId,
      status: 'ready',
      fileSize: result.fileSize,
      expiresAt,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[user-export] Export error:', msg);

    // Mark as failed if we have an export ID
    try {
      const authReq = req as AuthRequest;
      const latest = db.prepare(`
        SELECT id FROM gdpr_export_requests
        WHERE user_id = ? AND status = 'processing'
        ORDER BY requested_at DESC LIMIT 1
      `).get(authReq.user.id) as { id: string } | undefined;
      if (latest) {
        db.prepare("UPDATE gdpr_export_requests SET status = 'failed' WHERE id = ?").run(latest.id);
      }
    } catch { /* ignore */ }

    res.status(500).json({ error: 'Export failed', detail: msg });
  }
});

// GET /api/user/export/status — check export status
router.get('/export/status', authenticate, (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user.id;

    const record = db.prepare(`
      SELECT id, status, file_path, file_size_bytes, download_token, expires_at, download_count, requested_at, ready_at
      FROM gdpr_export_requests
      WHERE user_id = ?
      ORDER BY requested_at DESC LIMIT 1
    `).get(userId) as {
      id: string;
      status: string;
      file_path: string | null;
      file_size_bytes: number | null;
      download_token: string | null;
      expires_at: string | null;
      download_count: number;
      requested_at: string;
      ready_at: string | null;
    } | undefined;

    if (!record) {
      return res.json({ hasExport: false });
    }

    // Check if expired
    if (record.expires_at && new Date(record.expires_at) < new Date()) {
      if (record.file_path && fs.existsSync(record.file_path)) {
        fs.unlinkSync(record.file_path);
      }
      db.prepare("UPDATE gdpr_export_requests SET status = 'expired' WHERE id = ?").run(record.id);
      record.status = 'expired';
    }

    res.json({
      hasExport: true,
      exportId: record.id,
      status: record.status,
      fileSize: record.file_size_bytes,
      downloadCount: record.download_count,
      requestedAt: record.requested_at,
      readyAt: record.ready_at,
      expiresAt: record.expires_at,
      canDownload: record.status === 'ready' && record.download_token !== null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Could not check export status', detail: msg });
  }
});

// GET /api/user/export/download/:token — download with token
router.get('/export/download/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const record = db.prepare(`
      SELECT id, file_path, file_size_bytes, download_count, max_downloads, expires_at, status
      FROM gdpr_export_requests
      WHERE download_token = ?
    `).get(token) as {
      id: string;
      file_path: string;
      file_size_bytes: number;
      download_count: number;
      max_downloads: number;
      expires_at: string;
      status: string;
    } | undefined;

    if (!record) {
      return res.status(404).json({ error: 'Invalid or expired download link' });
    }

    if (record.status !== 'ready') {
      return res.status(400).json({ error: 'Export not ready' });
    }

    if (new Date(record.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Download link has expired' });
    }

    if (record.download_count >= record.max_downloads) {
      return res.status(410).json({ error: 'Maximum download count reached' });
    }

    if (!fs.existsSync(record.file_path)) {
      return res.status(404).json({ error: 'Export file not found' });
    }

    // Increment download count
    db.prepare(`
      UPDATE gdpr_export_requests
      SET download_count = download_count + 1, downloaded_at = datetime('now')
      WHERE id = ?
    `).run(record.id);

    const fileName = path.basename(record.file_path);
    res.download(record.file_path, fileName);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Download failed', detail: msg });
  }
});

// GET /api/user/export/preview — data overview before exporting
router.get('/export/preview', authenticate, (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user.id;

    // Count trips
    const tripCount = (db.prepare(`
      SELECT COUNT(DISTINCT t.id) as c FROM trips t
      LEFT JOIN trip_members tm ON tm.trip_id = t.id
      WHERE t.user_id = ? OR tm.user_id = ?
    `).get(userId, userId) as { c: number }).c;

    // Count places
    const placeCount = (db.prepare(`
      SELECT COUNT(*) as c FROM places p
      JOIN trips t ON t.id = p.trip_id
      LEFT JOIN trip_members tm ON tm.trip_id = t.id
      WHERE t.user_id = ? OR tm.user_id = ?
    `).get(userId, userId) as { c: number }).c;

    // Count budget items
    const budgetCount = (db.prepare(`
      SELECT COUNT(*) as c FROM budget_items bi
      JOIN trips t ON t.id = bi.trip_id
      LEFT JOIN trip_members tm ON tm.trip_id = t.id
      WHERE t.user_id = ? OR tm.user_id = ?
    `).get(userId, userId) as { c: number }).c;

    // Count reservations
    const reservationCount = (db.prepare(`
      SELECT COUNT(*) as c FROM reservations r
      JOIN trips t ON t.id = r.trip_id
      LEFT JOIN trip_members tm ON tm.trip_id = t.id
      WHERE t.user_id = ? OR tm.user_id = ?
    `).get(userId, userId) as { c: number }).c;

    // Count files (photos + trip_files)
    const photoCount = (db.prepare(`
      SELECT COUNT(*) as c FROM photos ph
      JOIN trips t ON t.id = ph.trip_id
      LEFT JOIN trip_members tm ON tm.trip_id = t.id
      WHERE t.user_id = ? OR tm.user_id = ?
    `).get(userId, userId) as { c: number }).c;

    const fileCount = (db.prepare(`
      SELECT COUNT(*) as c FROM trip_files tf
      JOIN trips t ON t.id = tf.trip_id
      LEFT JOIN trip_members tm ON tm.trip_id = t.id
      WHERE t.user_id = ? OR tm.user_id = ? AND tf.deleted_at IS NULL
    `).get(userId, userId) as { c: number }).c;

    // Count explore data
    const listingCount = (db.prepare(`SELECT COUNT(*) as c FROM explore_published WHERE user_id = ?`).get(userId) as { c: number }).c;
    const purchaseCount = (db.prepare(`SELECT COUNT(*) as c FROM explore_user_trips WHERE user_id = ?`).get(userId) as { c: number }).c;
    const reviewCount = (db.prepare(`SELECT COUNT(*) as c FROM explore_reviews WHERE user_id = ?`).get(userId) as { c: number }).c;

    res.json({
      trips: tripCount,
      places: placeCount,
      budgetItems: budgetCount,
      reservations: reservationCount,
      photos: photoCount,
      files: fileCount,
      exploreListings: listingCount,
      explorePurchases: purchaseCount,
      exploreReviews: reviewCount,
      totalFiles: photoCount + fileCount,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Could not generate preview', detail: msg });
  }
});

// POST /api/user/import — user self-import
router.post('/import', authenticate, importUpload.single('trek'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;

  try {
    const validation = await validateTrek(filePath);
    if (!validation.valid) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: validation.error });
    }

    // Force duplicate strategy for user imports
    const result = importFromTrek(validation.extractDir, validation.manifest, 'duplicate');

    const authReq = req as AuthRequest;
    writeAudit({
      userId: authReq.user.id,
      action: 'backup.user_import',
      resource: filePath,
      ip: getClientIp(req),
      details: { imported: result.imported },
    });

    cleanupExtractDir(validation.extractDir);
    fs.unlinkSync(filePath);

    res.json({
      success: result.success,
      imported: result.imported,
      errors: result.errors,
    });
  } catch (err: unknown) {
    fs.unlinkSync(filePath);
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Import failed', detail: msg });
  }
});

// Cleanup expired exports (can be called from scheduler)
export function cleanupExpiredExports(): void {
  try {
    const expired = db.prepare(`
      SELECT id, file_path FROM gdpr_export_requests
      WHERE expires_at IS NOT NULL AND expires_at < datetime('now') AND status != 'expired'
    `).all() as Array<{ id: string; file_path: string | null }>;

    for (const record of expired) {
      if (record.file_path && fs.existsSync(record.file_path)) {
        fs.unlinkSync(record.file_path);
      }
      db.prepare("UPDATE gdpr_export_requests SET status = 'expired' WHERE id = ?").run(record.id);
    }
    console.log(`[user-export] Cleaned up ${expired.length} expired exports`);
  } catch (err: unknown) {
    console.error('[user-export] Cleanup error:', err);
  }
}

export default router;
