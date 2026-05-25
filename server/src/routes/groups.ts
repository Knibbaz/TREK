import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { db } from '../db/database';
import * as svc from '../services/groupsService';
import { broadcastToGroup, broadcast } from '../websocket';
import { NextFunction } from 'express';

// ── Activity feed helper ─────────────────────────────────────────────────────
function logActivity(groupId: number, actorId: number, eventType: string, resourceId?: number | null, resourceTitle?: string | null) {
  try {
    const actor = db.prepare('SELECT username FROM users WHERE id = ?').get(actorId) as { username: string } | undefined;
    db.prepare(`
      INSERT INTO group_activity (group_id, actor_id, actor_name, event_type, resource_id, resource_title)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(groupId, actorId, actor?.username || null, eventType, resourceId ?? null, resourceTitle ?? null);
  } catch { /* non-critical — never block main action */ }
}

// ── Cover image upload ───────────────────────────────────────────────────────
const groupCoversDir = path.join(__dirname, '../../uploads/group-covers');
if (!fs.existsSync(groupCoversDir)) fs.mkdirSync(groupCoversDir, { recursive: true });
const coverStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, groupCoversDir),
  filename: (_req, file, cb) => cb(null, uuid() + path.extname(file.originalname).toLowerCase()),
});
const coverUpload = multer({
  storage: coverStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only images allowed'));
    cb(null, true);
  },
});

// Simple in-process rate limiter for guest endpoints (10 req/min per IP)
const guestAttempts = new Map<string, { count: number; first: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, r] of guestAttempts) { if (now - r.first >= 60_000) guestAttempts.delete(k); }
}, 5 * 60_000);
function guestRateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const record = guestAttempts.get(key);
  if (record && record.count >= 10 && now - record.first < 60_000) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  if (!record || now - record.first >= 60_000) {
    guestAttempts.set(key, { count: 1, first: now });
  } else {
    record.count++;
  }
  next();
}

const router = express.Router();

// Public route: validate a group invite token (no auth required)
router.get('/join/:token', (req: Request, res: Response) => {
  const data = svc.validateGroupInviteToken(req.params.token);
  if (!data) return res.status(404).json({ error: 'Invalid or expired invite link' });
  res.json({ group: data });
});

router.use(authenticate);

// ── List user's groups ──────────────────────────────────────────────────────
router.get('/', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  res.json({ groups: svc.listGroups(userId) });
});

// ── Create group ────────────────────────────────────────────────────────────
router.post('/', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const { name, description, cover_image } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const group = svc.createGroup(userId, { name, description, cover_image });
  res.status(201).json({ group });
});

// ── Get single group ────────────────────────────────────────────────────────
router.get('/:id', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const group = svc.getGroup(userId, parseInt(req.params.id));
  if (!group) return res.status(404).json({ error: 'Group not found' });
  res.json({ group });
});

// ── Update group ────────────────────────────────────────────────────────────
router.put('/:id', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const { name, description, cover_image } = req.body;
  const group = svc.updateGroup(parseInt(req.params.id), userId, { name, description, cover_image });
  if (!group) return res.status(404).json({ error: 'Group not found or forbidden' });
  res.json({ group });
});

// ── Update group welcome message ────────────────────────────────────────────
router.patch('/:id/welcome', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const { welcome_title, welcome_body, welcome_icon } = req.body;
  const ok = svc.updateGroupWelcome(parseInt(req.params.id), userId, { welcome_title, welcome_body, welcome_icon });
  if (!ok) return res.status(403).json({ error: 'Forbidden' });
  res.json({ success: true });
});

// ── Upload group cover image ─────────────────────────────────────────────────
router.post('/:id/cover', authenticate, coverUpload.single('cover'), (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const member = db.prepare(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, userId) as { role: string } | undefined;
  if (!member || (member.role !== 'owner' && member.role !== 'admin')) return res.status(403).json({ error: 'Forbidden' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  // Delete old custom cover if present
  const current = db.prepare(`SELECT cover_image FROM groups WHERE id = ?`).get(groupId) as { cover_image: string | null } | undefined;
  if (current?.cover_image?.startsWith('/uploads/group-covers/')) {
    const oldPath = path.join(__dirname, '../..', current.cover_image);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  const url = `/uploads/group-covers/${req.file.filename}`;
  db.prepare(`UPDATE groups SET cover_image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(url, groupId);
  res.json({ url });
});

// ── Delete group cover image ──────────────────────────────────────────────────
router.delete('/:id/cover', authenticate, (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const member = db.prepare(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, userId) as { role: string } | undefined;
  if (!member || (member.role !== 'owner' && member.role !== 'admin')) return res.status(403).json({ error: 'Forbidden' });
  const current = db.prepare(`SELECT cover_image FROM groups WHERE id = ?`).get(groupId) as { cover_image: string | null } | undefined;
  if (current?.cover_image?.startsWith('/uploads/group-covers/')) {
    const oldPath = path.join(__dirname, '../..', current.cover_image);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  db.prepare(`UPDATE groups SET cover_image = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(groupId);
  res.json({ success: true });
});

// ── Delete group ────────────────────────────────────────────────────────────
router.delete('/:id', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const ok = svc.deleteGroup(parseInt(req.params.id), userId);
  if (!ok) return res.status(403).json({ error: 'Forbidden' });
  res.json({ success: true });
});

// ── Add member ──────────────────────────────────────────────────────────────
router.post('/:id/members', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const { user_id, role } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  const result = svc.addMemberToGroup(groupId, parseInt(user_id), userId, role || 'member');
  if (!result.success) return res.status(result.error === 'Forbidden' ? 403 : 400).json({ error: result.error });
  const addedUser = db.prepare('SELECT id, username, avatar FROM users WHERE id = ?').get(user_id) as { id: number; username: string; avatar: string | null } | undefined;
  broadcastToGroup(groupId, 'group:memberJoined', {
    groupId,
    user: addedUser || { id: parseInt(user_id), username: '', avatar: null },
  }, req.headers['x-socket-id'] as string);
  logActivity(groupId, userId, 'member_added', parseInt(user_id), addedUser?.username || null);
  const group = svc.getGroup(userId, groupId);
  res.json({ group });
});

// ── Remove member ───────────────────────────────────────────────────────────
router.delete('/:id/members/:userId', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const memberUserId = parseInt(req.params.userId);
  const result = svc.removeMemberFromGroup(groupId, memberUserId, userId);
  if (!result.success) return res.status(result.error === 'Forbidden' ? 403 : 400).json({ error: result.error });
  broadcastToGroup(groupId, 'group:memberLeft', {
    groupId,
    userId: memberUserId,
  }, req.headers['x-socket-id'] as string);
  res.json({ success: true });
});

// ── Leave group with optional admin reassignment ────────────────────────────
router.post('/:id/leave', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const { new_admin_id } = req.body;
  const result = svc.leaveGroupWithReassignment(groupId, userId, new_admin_id ? parseInt(new_admin_id) : undefined);
  if (!result.success) return res.status(result.error === 'Forbidden' ? 403 : 400).json({ error: result.error });
  broadcastToGroup(groupId, 'group:memberLeft', {
    groupId,
    userId,
  }, req.headers['x-socket-id'] as string);
  res.json({ success: true });
});

// ── Update member role ──────────────────────────────────────────────────────
router.put('/:id/members/:userId/role', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const memberUserId = parseInt(req.params.userId);
  const { role } = req.body;
  if (!role || (role !== 'admin' && role !== 'member' && role !== 'viewer')) return res.status(400).json({ error: 'role must be admin, member, or viewer' });
  const result = svc.updateMemberRole(groupId, memberUserId, userId, role);
  if (!result.success) return res.status(result.error?.includes('owner') ? 403 : 400).json({ error: result.error });
  broadcastToGroup(groupId, 'group:memberRoleUpdated', {
    groupId,
    userId: memberUserId,
    role,
  }, req.headers['x-socket-id'] as string);
  res.json({ success: true });
});

// ── Add trip to group ───────────────────────────────────────────────────────
router.post('/:id/trips', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const { trip_id } = req.body;
  if (!trip_id) return res.status(400).json({ error: 'trip_id required' });
  const result = svc.addTripToGroup(groupId, parseInt(trip_id), userId);
  if (!result.success) return res.status(result.error === 'Forbidden' ? 403 : 400).json({ error: result.error });
  const tripInfo = db.prepare('SELECT title FROM trips WHERE id = ?').get(parseInt(trip_id)) as { title: string } | undefined;
  logActivity(groupId, userId, 'trip_added', parseInt(trip_id), tripInfo?.title || null);
  const group = svc.getGroup(userId, groupId);
  res.json({ group });
});

// ── Remove trip from group ──────────────────────────────────────────────────
router.delete('/:id/trips/:tripId', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const tripId = parseInt(req.params.tripId);
  const result = svc.removeTripFromGroup(groupId, tripId, userId);
  if (!result.success) return res.status(result.error === 'Forbidden' ? 403 : 400).json({ error: result.error });
  res.json({ success: true });
});

// ── Per-group vacay sharing preference ─────────────────────────────────────
router.patch('/:id/my-vacay-sharing', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const { share_vacay } = req.body as { share_vacay: boolean | null };

  const member = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  if (!member) return res.status(403).json({ error: 'Not a member' });

  const value = share_vacay === null ? null : (share_vacay ? 1 : 0);
  db.prepare('UPDATE group_members SET share_vacay = ? WHERE group_id = ? AND user_id = ?').run(value, groupId, userId);
  res.json({ success: true, share_vacay });
});

// ── Trip participants ───────────────────────────────────────────────────────
router.get('/:id/trips/:tripId/participants', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const tripId = parseInt(req.params.tripId);

  // Must be a group member
  const member = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  if (!member) return res.status(403).json({ error: 'Forbidden' });

  const participants = db.prepare(`
    SELECT u.id, u.username, u.avatar
    FROM group_trip_participants gtp
    JOIN users u ON u.id = gtp.user_id
    WHERE gtp.group_id = ? AND gtp.trip_id = ?
  `).all(groupId, tripId);

  res.json({ participants });
});

router.put('/:id/trips/:tripId/participants', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const tripId = parseInt(req.params.tripId);

  // Must be owner or admin
  const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId) as { role: string } | undefined;
  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { user_ids } = req.body as { user_ids: number[] };
  if (!Array.isArray(user_ids)) return res.status(400).json({ error: 'user_ids must be an array' });

  db.transaction(() => {
    db.prepare('DELETE FROM group_trip_participants WHERE group_id = ? AND trip_id = ?').run(groupId, tripId);
    const insert = db.prepare('INSERT OR IGNORE INTO group_trip_participants (group_id, trip_id, user_id) VALUES (?, ?, ?)');
    for (const uid of user_ids) {
      insert.run(groupId, tripId, uid);
    }
  })();

  const participants = db.prepare(`
    SELECT u.id, u.username, u.avatar
    FROM group_trip_participants gtp
    JOIN users u ON u.id = gtp.user_id
    WHERE gtp.group_id = ? AND gtp.trip_id = ?
  `).all(groupId, tripId);

  res.json({ participants });
});

// ── Group atlas (visited countries via place_regions) ───────────────────────
router.get('/:id/atlas', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);

  const member = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  if (!member) return res.status(403).json({ error: 'Forbidden' });

  const countries = db.prepare(`
    SELECT pr.country_code AS code, COUNT(DISTINCT p.id) AS place_count
    FROM group_trips gt
    JOIN places p ON p.trip_id = gt.trip_id
    JOIN place_regions pr ON pr.place_id = p.id
    WHERE gt.group_id = ?
    GROUP BY pr.country_code
    ORDER BY place_count DESC
  `).all(groupId) as { code: string; place_count: number }[];

  res.json({ countries });
});

// ── RSVP toggle (any member can mark themselves as going on a trip) ─────────
router.post('/:id/trips/:tripId/rsvp', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const tripId = parseInt(req.params.tripId);

  const member = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  if (!member) return res.status(403).json({ error: 'Forbidden' });

  const existing = db.prepare('SELECT id FROM group_trip_participants WHERE group_id = ? AND trip_id = ? AND user_id = ?').get(groupId, tripId, userId);
  let participating: boolean;
  if (existing) {
    db.prepare('DELETE FROM group_trip_participants WHERE group_id = ? AND trip_id = ? AND user_id = ?').run(groupId, tripId, userId);
    participating = false;
  } else {
    db.prepare('INSERT OR IGNORE INTO group_trip_participants (group_id, trip_id, user_id) VALUES (?, ?, ?)').run(groupId, tripId, userId);
    participating = true;
  }

  const participants = db.prepare(`
    SELECT u.id, u.username, u.avatar
    FROM group_trip_participants gtp
    JOIN users u ON u.id = gtp.user_id
    WHERE gtp.group_id = ? AND gtp.trip_id = ?
  `).all(groupId, tripId);

  res.json({ participating, participants });
});

// ── Group statistics ─────────────────────────────────────────────────────────
router.get('/:id/stats', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);

  const member = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  if (!member) return res.status(403).json({ error: 'Forbidden' });

  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(DISTINCT trip_id) FROM group_trips WHERE group_id = ?) AS trip_count,
      (SELECT COUNT(DISTINCT pr.country_code)
       FROM group_trips gt
       JOIN places p ON p.trip_id = gt.trip_id
       JOIN place_regions pr ON pr.place_id = p.id
       WHERE gt.group_id = ?) AS country_count,
      (SELECT COALESCE(SUM(
         CASE WHEN t.start_date IS NOT NULL AND t.end_date IS NOT NULL
         THEN CAST(julianday(t.end_date) - julianday(t.start_date) + 1 AS INTEGER)
         ELSE 0 END
       ), 0) FROM group_trips gt JOIN trips t ON t.id = gt.trip_id WHERE gt.group_id = ?) AS total_days,
      (SELECT COUNT(*) FROM group_members WHERE group_id = ?) AS member_count,
      (SELECT created_at FROM groups WHERE id = ?) AS group_created_at,
      (SELECT MIN(t.start_date) FROM group_trips gt JOIN trips t ON t.id = gt.trip_id WHERE gt.group_id = ? AND t.start_date IS NOT NULL) AS first_trip_date
  `).get(groupId, groupId, groupId, groupId, groupId, groupId) as {
    trip_count: number; country_count: number; total_days: number;
    member_count: number; group_created_at: string; first_trip_date: string | null;
  };

  // Compute milestones on-demand
  const milestones: string[] = [];
  if (stats.trip_count >= 1) milestones.push('first_trip');
  if (stats.trip_count >= 5) milestones.push('trips_5');
  if (stats.trip_count >= 10) milestones.push('trips_10');
  if (stats.trip_count >= 25) milestones.push('trips_25');
  if (stats.country_count >= 3) milestones.push('countries_3');
  if (stats.country_count >= 10) milestones.push('countries_10');
  if (stats.country_count >= 25) milestones.push('countries_25');
  if (stats.group_created_at) {
    const ageYears = (Date.now() - new Date(stats.group_created_at).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (ageYears >= 1) milestones.push('anniversary_1y');
    if (ageYears >= 2) milestones.push('anniversary_2y');
    if (ageYears >= 5) milestones.push('anniversary_5y');
  }

  res.json({ ...stats, milestones });
});

// ── Activity feed ───────────────────────────────────────────────────────────
router.get('/:id/activity', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const limit = Math.min(50, parseInt(String(req.query.limit || '30')));
  const before = req.query.before ? parseInt(String(req.query.before)) : null;

  const member = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  if (!member) return res.status(403).json({ error: 'Forbidden' });

  const events = db.prepare(`
    SELECT id, actor_id, actor_name, event_type, resource_id, resource_title, created_at
    FROM group_activity
    WHERE group_id = ? ${before ? 'AND id < ?' : ''}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...(before ? [groupId, before, limit] : [groupId, limit])) as Array<{
    id: number; actor_id: number | null; actor_name: string | null;
    event_type: string; resource_id: number | null; resource_title: string | null; created_at: string;
  }>;

  res.json({ events, hasMore: events.length === limit });
});

// ── Update group brand_color ─────────────────────────────────────────────────
router.patch('/:id/brand-color', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId) as { role: string } | undefined;
  if (!member || (member.role !== 'owner' && member.role !== 'admin')) return res.status(403).json({ error: 'Forbidden' });
  const { brand_color } = req.body as { brand_color: string | null };
  db.prepare('UPDATE groups SET brand_color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(brand_color ?? null, groupId);
  res.json({ success: true });
});

// ── Ideas (prikbord) ─────────────────────────────────────────────────────────
router.get('/:id/ideas', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const member = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  if (!member) return res.status(403).json({ error: 'Forbidden' });
  const ideas = db.prepare(`
    SELECT gi.id, gi.user_id, u.username AS author, gi.title, gi.body, gi.created_at
    FROM group_ideas gi JOIN users u ON u.id = gi.user_id
    WHERE gi.group_id = ? ORDER BY gi.created_at DESC
  `).all(groupId);
  res.json({ ideas });
});

router.post('/:id/ideas', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const member = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  if (!member) return res.status(403).json({ error: 'Forbidden' });
  const { title, body } = req.body as { title: string; body?: string };
  if (!title?.trim()) return res.status(400).json({ error: 'title required' });
  const result = db.prepare('INSERT INTO group_ideas (group_id, user_id, title, body) VALUES (?, ?, ?, ?)').run(groupId, userId, title.trim(), body?.trim() || null);
  const idea = db.prepare(`
    SELECT gi.id, gi.user_id, u.username AS author, gi.title, gi.body, gi.created_at
    FROM group_ideas gi JOIN users u ON u.id = gi.user_id WHERE gi.id = ?
  `).get(result.lastInsertRowid);
  logActivity(groupId, userId, 'idea_added', null, title.trim());
  res.status(201).json({ idea });
});

router.delete('/:id/ideas/:ideaId', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const ideaId = parseInt(req.params.ideaId);
  const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId) as { role: string } | undefined;
  if (!member) return res.status(403).json({ error: 'Forbidden' });
  const idea = db.prepare('SELECT user_id FROM group_ideas WHERE id = ? AND group_id = ?').get(ideaId, groupId) as { user_id: number } | undefined;
  if (!idea) return res.status(404).json({ error: 'Not found' });
  const isOwner = idea.user_id === userId || member.role === 'owner' || member.role === 'admin';
  if (!isOwner) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM group_ideas WHERE id = ?').run(ideaId);
  res.json({ success: true });
});

// ── Tasks (taakverdeling) ─────────────────────────────────────────────────────
router.get('/:id/tasks', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const member = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  if (!member) return res.status(403).json({ error: 'Forbidden' });
  const tasks = db.prepare(`
    SELECT gt.id, gt.title, gt.done, gt.assigned_to, gt.created_by, gt.sort_order, gt.created_at, gt.updated_at,
           u.username AS assigned_username, u.avatar AS assigned_avatar
    FROM group_tasks gt
    LEFT JOIN users u ON u.id = gt.assigned_to
    WHERE gt.group_id = ? ORDER BY gt.sort_order ASC, gt.created_at ASC
  `).all(groupId);
  res.json({ tasks });
});

router.post('/:id/tasks', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const member = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  if (!member) return res.status(403).json({ error: 'Forbidden' });
  const { title, assigned_to } = req.body as { title: string; assigned_to?: number };
  if (!title?.trim()) return res.status(400).json({ error: 'title required' });
  const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM group_tasks WHERE group_id = ?').get(groupId) as { m: number }).m;
  const result = db.prepare(`
    INSERT INTO group_tasks (group_id, title, assigned_to, created_by, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(groupId, title.trim(), assigned_to || null, userId, maxOrder + 1);
  const task = db.prepare(`
    SELECT gt.id, gt.title, gt.done, gt.assigned_to, gt.created_by, gt.sort_order, gt.created_at, gt.updated_at,
           u.username AS assigned_username, u.avatar AS assigned_avatar
    FROM group_tasks gt LEFT JOIN users u ON u.id = gt.assigned_to WHERE gt.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json({ task });
});

router.patch('/:id/tasks/:taskId', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const taskId = parseInt(req.params.taskId);
  const member = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  if (!member) return res.status(403).json({ error: 'Forbidden' });
  const existing = db.prepare('SELECT id FROM group_tasks WHERE id = ? AND group_id = ?').get(taskId, groupId);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { done, title, assigned_to } = req.body as { done?: boolean; title?: string; assigned_to?: number | null };
  const fields: string[] = [];
  const vals: unknown[] = [];
  if (done !== undefined) { fields.push('done = ?'); vals.push(done ? 1 : 0); }
  if (title !== undefined) { fields.push('title = ?'); vals.push(title.trim()); }
  if ('assigned_to' in req.body) { fields.push('assigned_to = ?'); vals.push(assigned_to ?? null); }
  if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });
  fields.push('updated_at = CURRENT_TIMESTAMP');
  db.prepare(`UPDATE group_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...vals, taskId);
  const task = db.prepare(`
    SELECT gt.id, gt.title, gt.done, gt.assigned_to, gt.created_by, gt.sort_order, gt.created_at, gt.updated_at,
           u.username AS assigned_username, u.avatar AS assigned_avatar
    FROM group_tasks gt LEFT JOIN users u ON u.id = gt.assigned_to WHERE gt.id = ?
  `).get(taskId);
  res.json({ task });
});

router.delete('/:id/tasks/:taskId', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const taskId = parseInt(req.params.taskId);
  const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId) as { role: string } | undefined;
  if (!member) return res.status(403).json({ error: 'Forbidden' });
  const task = db.prepare('SELECT created_by FROM group_tasks WHERE id = ? AND group_id = ?').get(taskId, groupId) as { created_by: number } | undefined;
  if (!task) return res.status(404).json({ error: 'Not found' });
  const canDelete = task.created_by === userId || member.role === 'owner' || member.role === 'admin';
  if (!canDelete) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM group_tasks WHERE id = ?').run(taskId);
  res.json({ success: true });
});

// ── Search users ────────────────────────────────────────────────────────────
router.get('/users/search', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const q = req.query.q as string;
  if (!q || q.trim().length < 2) return res.status(400).json({ error: 'Query too short' });
  res.json({ users: svc.searchUsersForInvite(userId, q) });
});

// ── Invite link management ──────────────────────────────────────────────────
router.post('/:id/invite-link', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const { role, max_uses, expires_in_days } = req.body;
  const result = svc.createGroupInviteLink(
    groupId,
    userId,
    role || 'member',
    max_uses != null ? parseInt(max_uses) : 0,
    expires_in_days != null ? parseInt(expires_in_days) : undefined
  );
  if (!result) return res.status(403).json({ error: 'Forbidden' });
  res.json({ token: result.token, expires_at: result.expires_at });
});

router.get('/:id/invite-link', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const link = svc.getGroupInviteLink(groupId, userId);
  if (link === null) return res.status(403).json({ error: 'Forbidden' });
  res.json({ link });
});

router.delete('/:id/invite-link', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const ok = svc.deleteGroupInviteLink(groupId, userId);
  if (!ok) return res.status(403).json({ error: 'Forbidden' });
  res.json({ success: true });
});

// ── Join group with invite token (authenticated) ────────────────────────────
router.post('/join/:token', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const result = svc.joinGroupWithToken(userId, req.params.token);
  if (!result.success) return res.status(result.status || 400).json({ error: result.error });
  // Notify all clients in the group room that a new member joined
  if (result.groupId) {
    const user = db.prepare('SELECT id, username, avatar FROM users WHERE id = ?').get(userId) as { id: number; username: string; avatar: string | null } | undefined;
    broadcastToGroup(result.groupId, 'group:memberJoined', {
      groupId: result.groupId,
      user: user || { id: userId, username: '', avatar: null },
    }, req.headers['x-socket-id'] as string);
  }
  res.json({ success: true, groupId: result.groupId });
});

// ── Create poll (only 1 open per group) ─────────────────────────────────────
router.post('/polls/:tripId', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const { title, description, type, anonymous, deadline, allow_guest_votes } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

  const result = svc.createGroupPoll(req.params.tripId, userId, {
    title,
    description,
    type,
    anonymous,
    deadline,
    allow_guest_votes,
  });

  if (!result.success) return res.status(400).json({ error: result.error });
  res.status(201).json({ pollId: result.pollId });
});

// ── List polls for a trip ────────────────────────────────────────────────────
router.get('/polls/:tripId', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const polls = svc.listGroupPolls(req.params.tripId, userId);
  res.json({ polls });
});

// ── Get single poll ──────────────────────────────────────────────────────────
router.get('/polls/:tripId/:pollId', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const poll = svc.getGroupPoll(req.params.pollId, userId);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  res.json({ poll });
});

// ── Add option to poll ───────────────────────────────────────────────────────
router.post('/polls/:tripId/:pollId/options', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const { label, description, lat, lng, image_url } = req.body;
  if (!label?.trim()) return res.status(400).json({ error: 'Label is required' });
  const result = svc.addPollOption(req.params.pollId, userId, { label, description, lat, lng, image_url });
  if (!result.success) return res.status(400).json({ error: result.error });

  broadcast(req.params.tripId, 'groups:poll:updated', { tripId: req.params.tripId, pollId: req.params.pollId },
    req.headers['x-socket-id'] as string);
  res.status(201).json({ option: result.option });
});

// ── Delete option from poll ──────────────────────────────────────────────────
router.delete('/polls/:tripId/:pollId/options/:optionId', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const result = svc.deletePollOption(req.params.optionId, userId);
  if (!result.success) return res.status(result.error === 'Forbidden' ? 403 : 400).json({ error: result.error });
  res.json({ success: true });
});

// ── Update option order (for swipe/ranked) ───────────────────────────────────
router.patch('/polls/:tripId/:pollId/options', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const { options } = req.body;
  if (!Array.isArray(options)) return res.status(400).json({ error: 'options must be an array' });
  const result = svc.updatePollOptionOrder(req.params.pollId, userId, options);
  if (!result.success) return res.status(result.error === 'Forbidden' ? 403 : 400).json({ error: result.error });

  broadcast(req.params.tripId, 'groups:poll:updated', { tripId: req.params.tripId, pollId: req.params.pollId },
    req.headers['x-socket-id'] as string);
  res.json({ success: true });
});

// ── Vote ─────────────────────────────────────────────────────────────────────
router.post('/polls/:tripId/:pollId/vote', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const { option_id } = req.body;
  if (!option_id) return res.status(400).json({ error: 'option_id required' });
  const result = svc.castVote(req.params.pollId, option_id, userId);
  if (!result.success) return res.status(400).json({ error: result.error });

  // Broadcast updated poll
  const poll = svc.getGroupPoll(req.params.pollId, userId);
  broadcast(req.params.tripId, 'groups:poll:updated', { tripId: req.params.tripId, poll },
    req.headers['x-socket-id'] as string);
  res.json({ success: true });
});

// ── Retract vote ─────────────────────────────────────────────────────────────
router.delete('/polls/:tripId/:pollId/vote/:optionId', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const result = svc.retractVote(req.params.pollId, req.params.optionId, userId);
  if (!result.success) return res.status(400).json({ error: result.error });
  res.json({ success: true });
});

// ── Update poll status (close / decide) ─────────────────────────────────────
router.patch('/polls/:tripId/:pollId', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const { status, decided_option_id } = req.body;
  if (!status || (status !== 'closed' && status !== 'decided')) {
    return res.status(400).json({ error: 'status must be closed or decided' });
  }
  const result = svc.updateGroupPollStatus(req.params.pollId, userId, status, decided_option_id);
  if (!result.success) return res.status(result.error === 'Forbidden' ? 403 : 400).json({ error: result.error });

  const poll = svc.getGroupPoll(req.params.pollId, userId);
  broadcast(req.params.tripId, 'groups:poll:updated', { tripId: req.params.tripId, poll },
    req.headers['x-socket-id'] as string);
  res.json({ success: true, poll });
});

// ── Ranked vote ──────────────────────────────────────────────────────────────
router.post('/polls/:tripId/:pollId/ranked-vote', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const { rankings } = req.body;
  if (!Array.isArray(rankings) || rankings.length === 0) {
    return res.status(400).json({ error: 'rankings array required' });
  }
  const result = svc.castRankedVotes(req.params.pollId, rankings, userId);
  if (!result.success) return res.status(400).json({ error: result.error });

  const poll = svc.getGroupPoll(req.params.pollId, userId);
  broadcast(req.params.tripId, 'groups:poll:updated', { tripId: req.params.tripId, poll },
    req.headers['x-socket-id'] as string);
  res.json({ success: true });
});

// ── Swipe vote ───────────────────────────────────────────────────────────────
router.post('/polls/:tripId/:pollId/swipe', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const { option_id, swipe_value } = req.body;
  if (!option_id || !swipe_value) return res.status(400).json({ error: 'option_id and swipe_value required' });
  if (!['like', 'dislike', 'superlike'].includes(swipe_value)) {
    return res.status(400).json({ error: 'swipe_value must be like, dislike, or superlike' });
  }
  const result = svc.castSwipeVote(req.params.pollId, option_id, swipe_value, userId);
  if (!result.success) return res.status(400).json({ error: result.error });
  res.json({ success: true });
});

// ── Swipe matches ─────────────────────────────────────────────────────────────
router.get('/polls/:tripId/:pollId/matches', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const matches = svc.getSwipeMatches(req.params.pollId, userId);
  res.json({ matches });
});

// ── Generate guest link ──────────────────────────────────────────────────────
router.post('/polls/:tripId/:pollId/guest-link', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const result = svc.createGuestPollLink(req.params.pollId, userId);
  if (!result.success) return res.status(400).json({ error: result.error });
  res.json({ token: result.token });
});

// ── Guest poll endpoints (no auth) ───────────────────────────────────────────
router.get('/guest/poll/:token', guestRateLimit, (req: Request, res: Response) => {
  const data = svc.getGuestPollByToken(req.params.token);
  if (!data) return res.status(404).json({ error: 'Invalid or expired guest link' });
  res.json(data);
});

router.post('/guest/poll/:token/vote', guestRateLimit, (req: Request, res: Response) => {
  const { votes, guest_name } = req.body;
  if (!Array.isArray(votes) || votes.length === 0) return res.status(400).json({ error: 'votes array required' });
  if (!guest_name?.trim()) return res.status(400).json({ error: 'guest_name required' });

  const result = svc.castGuestVote(req.params.token, votes, guest_name);
  if (!result.success) return res.status(400).json({ error: result.error });

  // Get poll info to broadcast update
  const data = svc.getGuestPollByToken(req.params.token);
  if (data?.poll) {
    const p = data.poll as Record<string, unknown>;
    broadcast(String(p.trip_id), 'groups:poll:updated', { tripId: p.trip_id, pollId: p.id }, undefined);
  }
  res.json({ success: true });
});

export default router;
