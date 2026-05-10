import express, { Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { authenticate, adminOnly } from '../../middleware/auth';
import { writeAudit, getClientIp } from '../../services/auditLog';
import { validateTrek, buildImportPreview, importFromTrek, cleanupExtractDir, type ImportResult } from '../../services/backup-v2/importer';
import { type ConflictStrategy } from '../../services/backup-v2/resolver';
import { db } from '../../db/database';

const router = express.Router();

router.use(authenticate, adminOnly);

const uploadsDir = path.join(__dirname, '../../../data/uploads-v2');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith('.trek')) cb(null, true);
    else cb(new Error('Only .trek files allowed'));
  },
});

// Track uploaded .trek files for preview/restore
const uploadSessions = new Map<string, { filePath: string; uploadedAt: number }>();

function generateUploadId(): string {
  return crypto.randomBytes(16).toString('hex');
}

// POST /api/admin/backup-v2/upload
router.post('/upload', upload.single('trek'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;
  const origName = req.file.originalname;

  try {
    const validation = await validateTrek(filePath);
    if (!validation.valid) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: validation.error || 'Invalid .trek file' });
    }

    const uploadId = generateUploadId();
    uploadSessions.set(uploadId, { filePath, uploadedAt: Date.now() });

    // Cleanup extract dir from validation (we keep the original file)
    if (validation.extractDir) {
      cleanupExtractDir(validation.extractDir);
    }

    res.json({
      success: true,
      uploadId,
      manifest: validation.manifest,
      versionWarning: validation.versionWarning,
    });
  } catch (err: unknown) {
    fs.unlinkSync(filePath);
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Upload validation failed', detail: msg });
  }
});

// GET /api/admin/backup-v2/upload/:id/preview
router.get('/upload/:id/preview', async (req: Request, res: Response) => {
  const { id } = req.params;
  const session = uploadSessions.get(id);

  if (!session || !fs.existsSync(session.filePath)) {
    return res.status(404).json({ error: 'Upload not found or expired' });
  }

  try {
    const { extractDir, manifest } = await validateTrek(session.filePath);
    const preview = buildImportPreview(extractDir, manifest);

    // Store extract dir for restore step
    session.extractDir = extractDir;

    res.json(preview);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Preview failed', detail: msg });
  }
});

// POST /api/admin/backup-v2/upload/:id/restore
router.post('/upload/:id/restore', async (req: Request, res: Response) => {
  const { id } = req.params;
  const session = uploadSessions.get(id) as { filePath: string; uploadedAt: number; extractDir?: string } | undefined;

  if (!session || !fs.existsSync(session.filePath)) {
    return res.status(404).json({ error: 'Upload not found or expired' });
  }

  const strategy = (req.body.strategy || 'duplicate') as ConflictStrategy;
  const scopes = req.body.scopes as string[] | undefined;
  const dryRun = req.body.dryRun === true;

  if (!['skip', 'overwrite', 'duplicate', 'merge'].includes(strategy)) {
    return res.status(400).json({ error: 'Invalid strategy' });
  }

  let extractDir = session.extractDir;

  try {
    if (!extractDir || !fs.existsSync(extractDir)) {
      const validation = await validateTrek(session.filePath);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
      extractDir = validation.extractDir;
    }

    const { manifest } = await validateTrek(session.filePath);

    const result = importFromTrek(extractDir, manifest, strategy, scopes, dryRun);

    // Audit log
    const authReq = req as any;
    writeAudit({
      userId: authReq.user.id,
      action: dryRun ? 'backup.import_preview' : 'backup.import_restore',
      resource: id,
      ip: getClientIp(req),
      details: { strategy, scopes, dryRun, imported: result.imported, skipped: result.skipped },
    });

    res.json({
      success: result.success,
      dryRun,
      strategy,
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Restore failed', detail: msg });
  } finally {
    if (extractDir && !dryRun) {
      cleanupExtractDir(extractDir);
    }
    // Don't remove the uploaded file yet — keep for potential retry
  }
});

// POST /api/user/import — user self-import
router.post('/user-import', authenticate, upload.single('trek'), async (req: Request, res: Response) => {
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

    const authReq = req as any;
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

// Cleanup old upload sessions
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of uploadSessions.entries()) {
    if (now - session.uploadedAt > 24 * 60 * 60 * 1000) {
      try {
        if (fs.existsSync(session.filePath)) fs.unlinkSync(session.filePath);
        if ((session as any).extractDir && fs.existsSync((session as any).extractDir)) {
          cleanupExtractDir((session as any).extractDir);
        }
      } catch { /* ignore */ }
      uploadSessions.delete(id);
    }
  }
}, 60 * 60 * 1000); // Every hour

export default router;
