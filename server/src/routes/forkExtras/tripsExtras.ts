import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { db, canAccessTrip } from '../../db/database';
import { authenticate, demoUploadBlock } from '../../middleware/auth';
import { broadcast } from '../../websocket';
import { AuthRequest, Trip } from '../../types';
import { writeAudit, getClientIp, logInfo } from '../../services/auditLog';
import { checkPermission } from '../../services/permissions';
import { copyTripTransaction } from '../../services/tripCopyService';
import { isGroupViewerForTrip } from '../../services/groupsService';
import { getUnsplashApiKeyRaw } from '../../services/adminService';
import {
  listTrips,
  createTrip,
  getTrip,
  updateTrip,
  deleteTrip,
  getTripRaw,
  getTripOwner,
  deleteOldCover,
  updateCoverImage,
  listMembers,
  addMember,
  removeMember,
  exportICS,
  copyTripById,
  verifyTripAccess,
  getOverflowInfo,
  NotFoundError,
  ValidationError,
  TRIP_SELECT,
} from '../../services/tripService';
import { listDays, listAccommodations } from '../../services/dayService';
import { listPlaces } from '../../services/placeService';
import { listItems as listPackingItems } from '../../services/packingService';
import { listItems as listTodoItems } from '../../services/todoService';
import { listBudgetItems } from '../../services/budgetService';
import { listReservations } from '../../services/reservationService';
import { listFiles } from '../../services/fileService';

const router = express.Router();

const MAX_COVER_SIZE = 20 * 1024 * 1024; // 20 MB

const coversDir = path.join(__dirname, '../../uploads/covers');
const coverStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir, { recursive: true });
    cb(null, coversDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});
const uploadCover = multer({
  storage: coverStorage,
  limits: { fileSize: MAX_COVER_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    if (file.mimetype.startsWith('image/') && !file.mimetype.includes('svg') && allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only jpg, png, gif, webp images allowed'));
    }
  },
});

// ── List trips ────────────────────────────────────────────────────────────

router.get('/cover-search', authenticate, async (req: Request, res: Response) => {
  const q = (req.query.q as string || '').trim();
  if (!q) return res.status(400).json({ error: 'q is required' });

  const apiKey = getUnsplashApiKeyRaw();
  if (!apiKey) return res.status(400).json({ error: 'Unsplash not configured' });

  const response = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=6&orientation=landscape&client_id=${apiKey}`,
  );
  const data = await response.json() as { results?: { id: string; urls?: { regular?: string; thumb?: string }; description?: string; alt_description?: string; user?: { name?: string; links?: { html?: string } }; links?: { html?: string } }[]; errors?: string[] };
  if (!response.ok) return res.status(response.status).json({ error: data.errors?.[0] || 'Unsplash API error' });

  const photos = (data.results || []).map(p => ({
    id: p.id,
    url: p.urls?.regular,
    thumb: p.urls?.thumb,
    description: p.description || p.alt_description,
    photographer: p.user?.name,
    photographerUrl: p.user?.links?.html,
    link: p.links?.html,
  }));
  res.json({ photos });
});

router.post('/unsplash-download', authenticate, async (req: Request, res: Response) => {
  const { photoId } = req.body as { photoId?: string };
  if (!photoId) return res.status(400).json({ error: 'photoId is required' });
  const apiKey = getUnsplashApiKeyRaw();
  if (apiKey) {
    // Best-effort — required by Unsplash API guidelines when a photo is used
    fetch(`https://api.unsplash.com/photos/${photoId}/download?client_id=${apiKey}`).catch(() => {});
  }
  res.json({ ok: true });
});

router.get('/:id/overflow-check', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tripId = Number(req.params.id);
  if (!canAccessTrip(tripId, authReq.user.id)) return res.status(403).json({ error: 'Access denied' });
  const { start_date, end_date } = req.query as { start_date?: string; end_date?: string };
  const info = getOverflowInfo(tripId, start_date || null, end_date || null);
  res.json(info);
});

router.get('/:id/groups', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  if (!canAccessTrip(req.params.id, authReq.user.id))
    return res.status(404).json({ error: 'Trip not found' });

  const groups = db.prepare(`
    SELECT g.id, g.name
    FROM group_trips gt
    JOIN groups g ON g.id = gt.group_id
    WHERE gt.trip_id = ?
  `).all(req.params.id) as Array<{ id: number; name: string }>;

  res.json({ groups });
});


export default router;
