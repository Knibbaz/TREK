import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth';
import { requireTripAccess } from '../middleware/tripAccess';
import { broadcast } from '../websocket';
import { validateStringLengths } from '../middleware/validate';
import { checkPermission } from '../services/permissions';
import { AuthRequest } from '../types';
import { db } from '../db/database';
import {
  listPlaces,
  createPlace,
  getPlace,
  updatePlace,
  deletePlace,
  deletePlacesMany,
  importGpx,
  importMapFile,
  importGoogleList,
  importNaverList,
  searchPlaceImage,
  type KmlImportOptions,
} from '../services/placeService';
import { onPlaceCreated, onPlaceUpdated, onPlaceDeleted } from '../services/journeyService';
import { trackPlaceAdded, trackPlaceModified, trackPlaceRemoved } from '../services/deltaTrackingService';

const uploadMulter = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Photo upload for places
const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10 MB
const placePhotosDir = path.join(__dirname, '../../uploads/place-photos');
const photoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(placePhotosDir)) fs.mkdirSync(placePhotosDir, { recursive: true });
    cb(null, placePhotosDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});
const uploadPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: MAX_PHOTO_SIZE },
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

const router = express.Router({ mergeParams: true });

router.get('/', authenticate, requireTripAccess, (req: Request, res: Response) => {
  const { tripId } = req.params;
  const { search, category, tag } = req.query;

  const places = listPlaces(tripId, {
    search: search as string | undefined,
    category: category as string | undefined,
    tag: tag as string | undefined,
  });

  res.json({ places });
});

router.post('/', authenticate, requireTripAccess, validateStringLengths({ name: 200, description: 2000, address: 500, notes: 2000 }), (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  if (!checkPermission('place_edit', authReq.user.role, authReq.trip!.user_id, authReq.user.id, authReq.trip!.user_id !== authReq.user.id))
    return res.status(403).json({ error: 'No permission' });

  const { tripId } = req.params;
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Place name is required' });
  }

  const place = createPlace(tripId, req.body);
  res.status(201).json({ place });
  broadcast(tripId, 'place:created', { place }, req.headers['x-socket-id'] as string);
  try { onPlaceCreated(Number(tripId), place.id); } catch {}
  try { trackPlaceAdded(db, Number(tripId), place.id, place); } catch {}
});

// Import places from GPX file with full track geometry (must be before /:id)
router.post('/import/gpx', authenticate, requireTripAccess, uploadMulter.single('file'), (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  if (!checkPermission('place_edit', authReq.user.role, authReq.trip!.user_id, authReq.user.id, authReq.trip!.user_id !== authReq.user.id))
    return res.status(403).json({ error: 'No permission' });

  const { tripId } = req.params;
  const file = req.file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  const parseBool = (v: unknown, defaultVal: boolean) => v === undefined || v === null ? defaultVal : String(v) === 'true';
  const importWaypoints = parseBool(req.body.importWaypoints, true);
  const importRoutes = parseBool(req.body.importRoutes, true);
  const importTracks = parseBool(req.body.importTracks, true);

  if (!importWaypoints && !importRoutes && !importTracks) {
    return res.status(400).json({ error: 'No import types selected' });
  }

  const result = importGpx(tripId, file.buffer, { importWaypoints, importRoutes, importTracks });
  if (!result) {
    return res.status(400).json({ error: 'No matching places found in GPX file' });
  }

  res.status(201).json({ places: result.places, count: result.count, skipped: result.skipped });
  for (const place of result.places) {
    broadcast(tripId, 'place:created', { place }, req.headers['x-socket-id'] as string);
  }
});

router.post('/import/map', authenticate, requireTripAccess, uploadMulter.single('file'), async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  if (!checkPermission('place_edit', authReq.user.role, authReq.trip!.user_id, authReq.user.id, authReq.trip!.user_id !== authReq.user.id)) {
    return res.status(403).json({ error: 'No permission' });
  }

  const { tripId } = req.params;
  const file = req.file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  const parseBool = (v: unknown, defaultVal: boolean) => v === undefined || v === null ? defaultVal : String(v) === 'true';
  const importPoints = parseBool(req.body.importPoints, true);
  const importPaths = parseBool(req.body.importPaths, true);

  if (!importPoints && !importPaths) {
    return res.status(400).json({ error: 'No import types selected' });
  }

  const kmlOpts: KmlImportOptions = { importPoints, importPaths };

  try {
    const result = await importMapFile(tripId, file.buffer, file.originalname, kmlOpts);
    if (result.summary?.totalPlacemarks === 0) {
      return res.status(400).json({ error: 'No valid Placemarks found in map file', summary: result.summary });
    }

    res.status(201).json(result);
    for (const place of result.places) {
      broadcast(tripId, 'place:created', { place }, req.headers['x-socket-id'] as string);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to import map file';
    res.status(400).json({ error: message });
  }
});

// Import places from a shared Google Maps list URL
router.post('/import/google-list', authenticate, requireTripAccess, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  if (!checkPermission('place_edit', authReq.user.role, authReq.trip!.user_id, authReq.user.id, authReq.trip!.user_id !== authReq.user.id))
    return res.status(403).json({ error: 'No permission' });

  const { tripId } = req.params;
  const { url } = req.body;
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL is required' });

  try {
    const result = await importGoogleList(tripId, url);

    if ('error' in result) {
      return res.status(result.status).json({ error: result.error });
    }

    res.status(201).json({ places: result.places, count: result.places.length, listName: result.listName, skipped: result.skipped });
    for (const place of result.places) {
      broadcast(tripId, 'place:created', { place }, req.headers['x-socket-id'] as string);
    }
  } catch (err: unknown) {
    console.error('[Places] Google list import error:', err instanceof Error ? err.message : err);
    res.status(400).json({ error: 'Failed to import Google Maps list. Make sure the list is shared publicly.' });
  }
});

// Import places from a shared Naver Maps list URL
router.post('/import/naver-list', authenticate, requireTripAccess, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  if (!checkPermission('place_edit', authReq.user.role, authReq.trip!.user_id, authReq.user.id, authReq.trip!.user_id !== authReq.user.id))
    return res.status(403).json({ error: 'No permission' });
  const { tripId } = req.params;
  const { url } = req.body;
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL is required' });

  try {
    const result = await importNaverList(tripId, url);

    if ('error' in result) {
      return res.status(result.status).json({ error: result.error });
    }

    res.status(201).json({ places: result.places, count: result.places.length, listName: result.listName, skipped: result.skipped });
    for (const place of result.places) {
      broadcast(tripId, 'place:created', { place }, req.headers['x-socket-id'] as string);
    }
  } catch (err: unknown) {
    console.error('[Places] Naver list import error:', err instanceof Error ? err.message : err);
    res.status(400).json({ error: 'Failed to import Naver Maps list. Make sure the list is shared publicly.' });
  }
});

// GET /trips/:tripId/places/export.gpx — must be before /:id to avoid route conflict
router.get('/export.gpx', authenticate, requireTripAccess, (req: AuthRequest, res: Response) => {
  const { tripId } = req.params;
  const places = db.prepare(
    'SELECT id, name, lat, lng, notes, address, website FROM places WHERE trip_id = ? ORDER BY id'
  ).all(tripId) as Array<{ id: number; name: string; lat: number | null; lng: number | null; notes: string | null; address: string | null; website: string | null }>;

  const escapeXml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const wpts = places
    .filter(p => p.lat != null && p.lng != null)
    .map(p => {
      const descParts = [p.notes, p.address, p.website].filter(Boolean) as string[];
      const desc = descParts.length ? `<desc>${escapeXml(descParts.join(' | '))}</desc>` : '';
      return `  <wpt lat="${p.lat}" lon="${p.lng}"><name>${escapeXml(p.name)}</name>${desc}</wpt>`;
    })
    .join('\n');

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="TREK" xmlns="http://www.topografix.com/GPX/1/1">\n${wpts}\n</gpx>`;
  res.setHeader('Content-Type', 'application/gpx+xml');
  res.setHeader('Content-Disposition', `attachment; filename="places-${tripId}.gpx"`);
  res.send(gpx);
});

router.get('/:id', authenticate, requireTripAccess, (req: Request, res: Response) => {
  const { tripId, id } = req.params;

  const place = getPlace(tripId, id);
  if (!place) {
    return res.status(404).json({ error: 'Place not found' });
  }

  res.json({ place });
});

router.get('/:id/image', authenticate, requireTripAccess, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { tripId, id } = req.params;
  const manualQuery = typeof req.query.q === 'string' ? req.query.q : undefined;

  try {
    const result = await searchPlaceImage(tripId, id, authReq.user.id, manualQuery);

    if ('error' in result) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json({ photos: result.photos });
  } catch (err: unknown) {
    console.error('Unsplash error:', err);
    res.status(500).json({ error: 'Error searching for image' });
  }
});

// Set Unsplash image as place photo
router.post('/:id/image', authenticate, requireTripAccess, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  if (!checkPermission('place_edit', authReq.user.role, authReq.trip!.user_id, authReq.user.id, authReq.trip!.user_id !== authReq.user.id))
    return res.status(403).json({ error: 'No permission' });

  const { tripId, id } = req.params;
  const { image_url } = req.body;

  if (!image_url || typeof image_url !== 'string') {
    return res.status(400).json({ error: 'image_url is required' });
  }

  const place = getPlace(tripId, id);
  if (!place) {
    return res.status(404).json({ error: 'Place not found' });
  }

  // Delete old uploaded photo if exists
  if (place.image_url && place.image_url.startsWith('/uploads/place-photos/')) {
    const oldPath = path.join(__dirname, '../..', place.image_url);
    try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch {}
  }

  const updated = updatePlace(tripId, id, { image_url });
  
  res.json({ place: updated });
  broadcast(tripId, 'place:updated', { place: updated }, req.headers['x-socket-id'] as string);
  try { onPlaceUpdated(Number(id)); } catch {}
});

router.put('/:id', authenticate, requireTripAccess, validateStringLengths({ name: 200, description: 2000, address: 500, notes: 2000 }), (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  if (!checkPermission('place_edit', authReq.user.role, authReq.trip!.user_id, authReq.user.id, authReq.trip!.user_id !== authReq.user.id))
    return res.status(403).json({ error: 'No permission' });

  const { tripId, id } = req.params;

  const originalPlace = getPlace(tripId, id);
  const place = updatePlace(tripId, id, req.body);
  if (!place) {
    return res.status(404).json({ error: 'Place not found' });
  }

  res.json({ place });
  broadcast(tripId, 'place:updated', { place }, req.headers['x-socket-id'] as string);
  try { onPlaceUpdated(place.id); } catch {}
  try { if (originalPlace) trackPlaceModified(db, Number(tripId), Number(id), originalPlace, place); } catch {}
});

// ── Place photo upload ────────────────────────────────────────────────────
router.post('/:id/photo', authenticate, requireTripAccess, uploadPhoto.single('photo'), (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  if (!checkPermission('place_edit', authReq.user.role, authReq.trip!.user_id, authReq.user.id, authReq.trip!.user_id !== authReq.user.id))
    return res.status(403).json({ error: 'No permission' });

  const { tripId, id } = req.params;
  const place = getPlace(tripId, id);
  if (!place) {
    return res.status(404).json({ error: 'Place not found' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }

  // Delete old photo if exists
  if (place.image_url && place.image_url.startsWith('/uploads/place-photos/')) {
    const oldPath = path.join(__dirname, '../..', place.image_url);
    try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch {}
  }

  const photoUrl = `/uploads/place-photos/${req.file.filename}`;
  const updated = updatePlace(tripId, id, { image_url: photoUrl });
  
  res.json({ place: updated });
  broadcast(tripId, 'place:updated', { place: updated }, req.headers['x-socket-id'] as string);
  try { onPlaceUpdated(Number(id)); } catch {}
});

// ── Place photo delete ────────────────────────────────────────────────────
router.delete('/:id/photo', authenticate, requireTripAccess, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  if (!checkPermission('place_edit', authReq.user.role, authReq.trip!.user_id, authReq.user.id, authReq.trip!.user_id !== authReq.user.id))
    return res.status(403).json({ error: 'No permission' });

  const { tripId, id } = req.params;
  const place = getPlace(tripId, id);
  if (!place) {
    return res.status(404).json({ error: 'Place not found' });
  }

  // Delete old photo file if exists
  if (place.image_url && place.image_url.startsWith('/uploads/place-photos/')) {
    const oldPath = path.join(__dirname, '../..', place.image_url);
    try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch {}
  }

  const updated = updatePlace(tripId, id, { image_url: null });
  
  res.json({ place: updated });
  broadcast(tripId, 'place:updated', { place: updated }, req.headers['x-socket-id'] as string);
  try { onPlaceUpdated(Number(id)); } catch {}
});

// Bulk delete (must be before /:id)
router.post('/bulk-delete', authenticate, requireTripAccess, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  if (!checkPermission('place_edit', authReq.user.role, authReq.trip!.user_id, authReq.user.id, authReq.trip!.user_id !== authReq.user.id))
    return res.status(403).json({ error: 'No permission' });

  const { tripId } = req.params;
  const { ids } = req.body as { ids?: unknown };
  if (!Array.isArray(ids) || ids.some(v => typeof v !== 'number'))
    return res.status(400).json({ error: 'ids must be an array of numbers' });

  const idList = ids as number[];
  if (idList.length === 0) return res.json({ deleted: [], count: 0 });

  for (const id of idList) { try { onPlaceDeleted(id); } catch {} }
  const deleted = deletePlacesMany(tripId, idList);

  res.json({ deleted, count: deleted.length });
  const socketId = req.headers['x-socket-id'] as string;
  for (const id of deleted) {
    broadcast(tripId, 'place:deleted', { placeId: id }, socketId);
  }
});

router.delete('/:id', authenticate, requireTripAccess, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  if (!checkPermission('place_edit', authReq.user.role, authReq.trip!.user_id, authReq.user.id, authReq.trip!.user_id !== authReq.user.id))
    return res.status(403).json({ error: 'No permission' });

  const { tripId, id } = req.params;

  const place = getPlace(tripId, id);
  try { onPlaceDeleted(Number(id)); } catch {} // sync before actual delete
  const deleted = deletePlace(tripId, id);
  if (!deleted) {
    return res.status(404).json({ error: 'Place not found' });
  }

  res.json({ success: true });
  broadcast(tripId, 'place:deleted', { placeId: Number(id) }, req.headers['x-socket-id'] as string);
  try { if (place) trackPlaceRemoved(db, Number(tripId), Number(id), place); } catch {}
});

// ── Place votes ───────────────────────────────────────────────────────────────

function getPlaceVotes(placeId: string | number) {
  return db.prepare(`
    SELECT pv.user_id, pv.vote, u.username, u.avatar AS avatar_url
    FROM place_votes pv JOIN users u ON u.id = pv.user_id
    WHERE pv.place_id = ?
    ORDER BY pv.created_at ASC
  `).all(placeId) as Array<{ user_id: number; vote: 1 | -1; username: string; avatar_url: string | null }>;
}

// GET /trips/:tripId/places/:id/votes
router.get('/:id/votes', authenticate, requireTripAccess, (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ votes: getPlaceVotes(id) });
});

// PUT /trips/:tripId/places/:id/vote  body: { vote: 1 | -1 | null }
router.put('/:id/vote', authenticate, requireTripAccess, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { tripId, id } = req.params;
  const { vote } = req.body as { vote: unknown };

  const inGroup = db.prepare('SELECT 1 FROM group_trips WHERE trip_id = ?').get(tripId);
  if (!inGroup) return res.status(403).json({ error: 'Voting is only available for trips shared with a group' });

  if (vote === null || vote === undefined) {
    db.prepare('DELETE FROM place_votes WHERE place_id = ? AND user_id = ?').run(id, authReq.user.id);
  } else if (vote === 1 || vote === -1) {
    db.prepare(`
      INSERT INTO place_votes (place_id, user_id, vote) VALUES (?, ?, ?)
      ON CONFLICT(place_id, user_id) DO UPDATE SET vote = excluded.vote
    `).run(id, authReq.user.id, vote);
  } else {
    return res.status(400).json({ error: 'vote must be 1, -1, or null' });
  }

  const votes = getPlaceVotes(id);
  res.json({ votes });
  broadcast(tripId, 'place:voted', { placeId: Number(id), votes }, req.headers['x-socket-id'] as string);
});

export default router;
