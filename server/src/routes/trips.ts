import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { db, canAccessTrip } from '../db/database';
import { authenticate, demoUploadBlock } from '../middleware/auth';
import { broadcast } from '../websocket';
import { AuthRequest, Trip } from '../types';
import { writeAudit, getClientIp, logInfo } from '../services/auditLog';
import { checkPermission } from '../services/permissions';
import { copyTripTransaction } from '../services/tripCopyService';
import { getUnsplashApiKeyRaw } from '../services/adminService';
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
} from '../services/tripService';
import { listDays, listAccommodations } from '../services/dayService';
import { listPlaces } from '../services/placeService';
import { listItems as listPackingItems } from '../services/packingService';
import { listItems as listTodoItems } from '../services/todoService';
import { listBudgetItems } from '../services/budgetService';
import { listReservations } from '../services/reservationService';
import { listFiles } from '../services/fileService';

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

router.get('/', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const archived = req.query.archived === '1' ? 1 : 0;
  const trips = listTrips(authReq.user.id, archived);
  res.json({ trips });
});

// ── Create trip ───────────────────────────────────────────────────────────

router.post('/', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  if (!checkPermission('trip_create', authReq.user.role, null, authReq.user.id, false))
    return res.status(403).json({ error: 'No permission to create trips' });

  const { title, description, currency, reminder_days, day_count } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  const toDateStr = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

  let start_date: string | null = req.body.start_date || null;
  let end_date: string | null = req.body.end_date || null;

  if (!start_date && !end_date) {
    // No dates: create dateless placeholder days (day_count or default 7)
  } else if (start_date && !end_date) {
    end_date = toDateStr(addDays(new Date(start_date), 6));
  } else if (!start_date && end_date) {
    start_date = toDateStr(addDays(new Date(end_date), -6));
  }

  if (start_date && end_date && new Date(end_date) < new Date(start_date))
    return res.status(400).json({ error: 'End date must be after start date' });

  const parsedDayCount = day_count ? Math.min(Math.max(Number(day_count) || 7, 1), 365) : undefined;
  const { trip, tripId, reminderDays } = createTrip(authReq.user.id, { title, description, start_date, end_date, currency, reminder_days, day_count: parsedDayCount });

  writeAudit({ userId: authReq.user.id, action: 'trip.create', ip: getClientIp(req), details: { tripId, title, reminder_days: reminderDays === 0 ? 'none' : `${reminderDays} days` } });
  if (reminderDays > 0) {
    logInfo(`${authReq.user.email} set ${reminderDays}-day reminder for trip "${title}"`);
  }

  res.status(201).json({ trip });
});

// ── Unsplash cover search ─────────────────────────────────────────────────
// Must be before /:id to avoid 'cover-search' being parsed as a trip ID.

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

// ── Overflow check (must be before /:id) ─────────────────────────────────

router.get('/:id/overflow-check', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tripId = Number(req.params.id);
  if (!canAccessTrip(tripId, authReq.user.id)) return res.status(403).json({ error: 'Access denied' });
  const { start_date, end_date } = req.query as { start_date?: string; end_date?: string };
  const info = getOverflowInfo(tripId, start_date || null, end_date || null);
  res.json(info);
});

// ── Get trip ──────────────────────────────────────────────────────────────

router.get('/:id', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const trip = getTrip(req.params.id, authReq.user.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  res.json({ trip });
});

// ── Update trip ───────────────────────────────────────────────────────────

router.put('/:id', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const access = canAccessTrip(req.params.id, authReq.user.id);
  if (!access) return res.status(404).json({ error: 'Trip not found' });

  const tripOwnerId = access.user_id;
  const isMember = access.user_id !== authReq.user.id;

  // Archive check
  if (req.body.is_archived !== undefined) {
    if (!checkPermission('trip_archive', authReq.user.role, tripOwnerId, authReq.user.id, isMember))
      return res.status(403).json({ error: 'No permission to archive/unarchive this trip' });
  }
  // Cover image check
  if (req.body.cover_image !== undefined) {
    if (!checkPermission('trip_cover_upload', authReq.user.role, tripOwnerId, authReq.user.id, isMember))
      return res.status(403).json({ error: 'No permission to change cover image' });
  }
  // General edit check (title, description, dates, currency, reminder_days)
  const editFields = ['title', 'description', 'start_date', 'end_date', 'currency', 'reminder_days', 'day_count'];
  if (editFields.some(f => req.body[f] !== undefined)) {
    if (!checkPermission('trip_edit', authReq.user.role, tripOwnerId, authReq.user.id, isMember))
      return res.status(403).json({ error: 'No permission to edit this trip' });
  }

  try {
    const result = updateTrip(req.params.id, authReq.user.id, req.body, authReq.user.role);

    if (Object.keys(result.changes).length > 0) {
      writeAudit({ userId: authReq.user.id, action: 'trip.update', ip: getClientIp(req), details: { tripId: Number(req.params.id), trip: result.newTitle, ...(result.ownerEmail ? { owner: result.ownerEmail } : {}), ...result.changes } });
      if (result.isAdminEdit && result.ownerEmail) {
        logInfo(`Admin ${authReq.user.email} edited trip "${result.newTitle}" owned by ${result.ownerEmail}`);
      }
    }

    if (result.newReminder !== result.oldReminder) {
      if (result.newReminder > 0) {
        logInfo(`${authReq.user.email} set ${result.newReminder}-day reminder for trip "${result.newTitle}"`);
      } else {
        logInfo(`${authReq.user.email} removed reminder for trip "${result.newTitle}"`);
      }
    }

    res.json({ trip: result.updatedTrip });
    broadcast(req.params.id, 'trip:updated', { trip: result.updatedTrip }, req.headers['x-socket-id'] as string);
  } catch (e: any) {
    if (e instanceof NotFoundError) return res.status(404).json({ error: e.message });
    if (e instanceof ValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

// ── Cover upload ──────────────────────────────────────────────────────────

router.post('/:id/cover', authenticate, demoUploadBlock, uploadCover.single('cover'), (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const access = canAccessTrip(req.params.id, authReq.user.id);
  const tripOwnerId = access?.user_id;
  if (!tripOwnerId) return res.status(404).json({ error: 'Trip not found' });
  const isMember = tripOwnerId !== authReq.user.id;
  if (!checkPermission('trip_cover_upload', authReq.user.role, tripOwnerId, authReq.user.id, isMember))
    return res.status(403).json({ error: 'No permission to change the cover image' });

  const trip = getTripRaw(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  deleteOldCover(trip.cover_image);

  const coverUrl = `/uploads/covers/${req.file.filename}`;
  updateCoverImage(req.params.id, coverUrl);
  res.json({ cover_image: coverUrl });
});

// ── Copy / duplicate a trip ──────────────────────────────────────────────────
router.post('/:id/copy', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  if (!checkPermission('trip_create', authReq.user.role, null, authReq.user.id, false))
    return res.status(403).json({ error: 'No permission to create trips' });

  if (!canAccessTrip(req.params.id, authReq.user.id))
    return res.status(404).json({ error: 'Trip not found' });

  const src = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id) as Trip | undefined;
  if (!src) return res.status(404).json({ error: 'Trip not found' });

  const title = req.body.title || src.title;

  try {
    const newTripId = copyTripTransaction(db, Number(req.params.id), authReq.user.id, title);
    writeAudit({ userId: authReq.user.id, action: 'trip.copy', ip: getClientIp(req), details: { sourceTripId: Number(req.params.id), newTripId: Number(newTripId), title } });
    const trip = db.prepare(`${TRIP_SELECT} WHERE t.id = :tripId`).get({ userId: authReq.user.id, tripId: newTripId });
    res.status(201).json({ trip });
  } catch {
    return res.status(500).json({ error: 'Failed to copy trip' });
  }
});

router.delete('/:id', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tripOwner = getTripOwner(req.params.id);
  if (!tripOwner) return res.status(404).json({ error: 'Trip not found' });
  const tripOwnerId = tripOwner.user_id;
  const isMemberDel = tripOwnerId !== authReq.user.id;
  if (!checkPermission('trip_delete', authReq.user.role, tripOwnerId, authReq.user.id, isMemberDel))
    return res.status(403).json({ error: 'No permission to delete this trip' });

  const info = deleteTrip(req.params.id, authReq.user.id, authReq.user.role);

  writeAudit({ userId: authReq.user.id, action: 'trip.delete', ip: getClientIp(req), details: { tripId: info.tripId, trip: info.title, ...(info.ownerEmail ? { owner: info.ownerEmail } : {}) } });
  if (info.isAdminDelete && info.ownerEmail) {
    logInfo(`Admin ${authReq.user.email} deleted trip "${info.title}" owned by ${info.ownerEmail}`);
  }

  res.json({ success: true });
  broadcast(info.tripId, 'trip:deleted', { id: info.tripId }, req.headers['x-socket-id'] as string);
});

// ── List members ──────────────────────────────────────────────────────────

router.get('/:id/members', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const access = canAccessTrip(req.params.id, authReq.user.id);
  if (!access)
    return res.status(404).json({ error: 'Trip not found' });

  const { owner, members } = listMembers(req.params.id, access.user_id);
  res.json({ owner, members, current_user_id: authReq.user.id });
});

// ── Add member ────────────────────────────────────────────────────────────

router.post('/:id/members', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const access = canAccessTrip(req.params.id, authReq.user.id);
  if (!access)
    return res.status(404).json({ error: 'Trip not found' });

  const tripOwnerId = access.user_id;
  const isMember = tripOwnerId !== authReq.user.id;
  if (!checkPermission('member_manage', authReq.user.role, tripOwnerId, authReq.user.id, isMember))
    return res.status(403).json({ error: 'No permission to manage members' });

  const { identifier } = req.body;

  try {
    const result = addMember(req.params.id, identifier, tripOwnerId, authReq.user.id);

    // Notify invited user
    import('../services/notificationService').then(({ send }) => {
      send({ event: 'trip_invite', actorId: authReq.user.id, scope: 'user', targetId: result.targetUserId, params: { trip: result.tripTitle, actor: authReq.user.email, invitee: result.member.email, tripId: String(req.params.id) } }).catch(() => {});
    });

    res.status(201).json({ member: result.member });
  } catch (e: any) {
    if (e instanceof NotFoundError) return res.status(404).json({ error: e.message });
    if (e instanceof ValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

// ── Remove member ─────────────────────────────────────────────────────────

router.delete('/:id/members/:userId', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  if (!canAccessTrip(req.params.id, authReq.user.id))
    return res.status(404).json({ error: 'Trip not found' });

  const targetId = parseInt(req.params.userId);
  const isSelf = targetId === authReq.user.id;
  if (!isSelf) {
    const access = canAccessTrip(req.params.id, authReq.user.id);
    if (!access) return res.status(404).json({ error: 'Trip not found' });
    const memberCheck = access.user_id !== authReq.user.id;
    if (!checkPermission('member_manage', authReq.user.role, access.user_id, authReq.user.id, memberCheck))
      return res.status(403).json({ error: 'No permission to remove members' });
  }

  removeMember(req.params.id, targetId);
  res.json({ success: true });
});

// ── Offline bundle ────────────────────────────────────────────────────────
// Returns all trip sub-collections in a single request for offline caching.

router.get('/:id/bundle', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tripId = req.params.id;

  const trip = getTrip(tripId, authReq.user.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  const { days } = listDays(tripId);
  const places = listPlaces(String(tripId), {});
  const packingItems = listPackingItems(tripId);
  const todoItems = listTodoItems(tripId);
  const budgetItems = listBudgetItems(tripId);
  const reservations = listReservations(tripId);
  const files = listFiles(tripId, false);
  const accommodations = listAccommodations(tripId);
  const { owner, members } = listMembers(tripId, trip.user_id);
  const allMembers = [owner, ...(members || [])].filter(Boolean);

  res.json({
    trip,
    days,
    places,
    packingItems,
    todoItems,
    budgetItems,
    reservations,
    files,
    accommodations,
    members: allMembers,
  });
});

// ── ICS calendar export ───────────────────────────────────────────────────

router.get('/:id/export.ics', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  if (!canAccessTrip(req.params.id, authReq.user.id))
    return res.status(404).json({ error: 'Trip not found' });

  try {
    const { ics, filename } = exportICS(req.params.id);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(ics);
  } catch (e: any) {
    if (e instanceof NotFoundError) return res.status(404).json({ error: e.message });
    throw e;
  }
});

export default router;
