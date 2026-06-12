import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../../middleware/auth';
import { requireTripAccess } from '../../middleware/tripAccess';
import { broadcast } from '../../websocket';
import { validateStringLengths } from '../../middleware/validate';
import { checkPermission } from '../../services/permissions';
import { AuthRequest } from '../../types';
import { db } from '../../db/database';
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
} from '../../services/placeService';
import { onPlaceCreated, onPlaceUpdated, onPlaceDeleted } from '../../services/journeyService';
import { trackPlaceAdded, trackPlaceModified, trackPlaceRemoved } from '../../services/deltaTrackingService';

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

function getPlaceVotes(placeId: string | number) {
  return db.prepare(`
    SELECT pv.user_id, pv.vote, u.username, u.avatar AS avatar_url
    FROM place_votes pv JOIN users u ON u.id = pv.user_id
    WHERE pv.place_id = ?
    ORDER BY pv.created_at ASC
  `).all(placeId) as Array<{ user_id: number; vote: 1 | -1; username: string; avatar_url: string | null }>;
}


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

router.get('/:id/votes', authenticate, requireTripAccess, (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ votes: getPlaceVotes(id) });
});

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
