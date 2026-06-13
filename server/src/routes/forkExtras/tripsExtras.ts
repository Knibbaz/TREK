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

// ── Timezones of the user's planned/active trips (ROUTD) ──────────────────────
// Powers the dashboard world-clock: returns the distinct timezone of each
// upcoming or ongoing trip, derived from its first geocoded place. Lets the
// dashboard auto-show clocks for places you're actually travelling to.
router.get('/timezones', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const tzlookup = require('tz-lookup') as (lat: number, lng: number) => string;

  const trips = db.prepare(`
    SELECT id, title, start_date, end_date FROM trips
    WHERE user_id = ? AND is_archived = 0
      AND (end_date IS NULL OR date(end_date) >= date('now'))
    ORDER BY date(start_date) ASC
    LIMIT 25
  `).all(authReq.user.id) as Array<{ id: number; title: string; start_date: string | null; end_date: string | null }>;

  const out: Array<{ trip_id: number; title: string; timezone: string }> = [];
  const seen = new Set<string>();
  for (const trip of trips) {
    const place = db.prepare(
      'SELECT lat, lng FROM places WHERE trip_id = ? AND lat IS NOT NULL AND lng IS NOT NULL LIMIT 1'
    ).get(trip.id) as { lat: number; lng: number } | undefined;
    if (!place) continue;
    try {
      const tz = tzlookup(place.lat, place.lng);
      if (!tz || seen.has(tz)) continue;
      seen.add(tz);
      out.push({ trip_id: trip.id, title: trip.title, timezone: tz });
    } catch { /* invalid coords → skip */ }
  }
  res.json({ timezones: out });
});

// ── Bucket-list suggestions for a trip (ROUTD) ────────────────────────────────
// Surfaces the user's per-country bucket list when they plan a trip: derive the
// trip's country from its existing places (most-common country), then return the
// bucket-list items for that country that aren't yet on the trip as a place.
router.get('/:id/bucket-list-suggestions', authenticate, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tripId = req.params.id;
  if (!canAccessTrip(tripId, authReq.user.id)) return res.status(404).json({ error: 'Trip not found' });

  const places = db.prepare(
    'SELECT name, lat, lng FROM places WHERE trip_id = ? AND lat IS NOT NULL AND lng IS NOT NULL'
  ).all(tripId) as Array<{ name: string; lat: number; lng: number }>;
  if (places.length === 0) return res.json({ country_code: null, items: [] });

  // Tally countries across up to 8 places to find the trip's dominant country.
  const { reverseGeocodeCountry } = require('../../services/atlasService');
  const tally = new Map<string, number>();
  for (const p of places.slice(0, 8)) {
    try {
      const code = await reverseGeocodeCountry(p.lat, p.lng);
      if (code) tally.set(code, (tally.get(code) || 0) + 1);
    } catch { /* ignore geocode failures */ }
  }
  if (tally.size === 0) return res.json({ country_code: null, items: [] });
  const country = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const items = db.prepare(
    'SELECT id, name, lat, lng, country_code, notes FROM bucket_list WHERE user_id = ? AND UPPER(country_code) = ? ORDER BY created_at DESC'
  ).all(authReq.user.id, country.toUpperCase()) as Array<{ id: number; name: string; lat: number | null; lng: number | null; country_code: string; notes: string | null }>;

  // Hide items already added to this trip (same name, case-insensitive).
  const existing = new Set(places.map(p => p.name.trim().toLowerCase()));
  const filtered = items.filter(it => !existing.has(it.name.trim().toLowerCase()));

  res.json({ country_code: country, items: filtered });
});

export default router;
