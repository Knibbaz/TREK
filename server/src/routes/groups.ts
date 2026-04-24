import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import * as svc from '../services/groupsService';

const router = express.Router();
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
  res.json({ success: true });
});

// ── Update member role ──────────────────────────────────────────────────────
router.put('/:id/members/:userId/role', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const groupId = parseInt(req.params.id);
  const memberUserId = parseInt(req.params.userId);
  const { role } = req.body;
  if (!role || (role !== 'admin' && role !== 'member')) return res.status(400).json({ error: 'role must be admin or member' });
  const result = svc.updateMemberRole(groupId, memberUserId, userId, role);
  if (!result.success) return res.status(result.error?.includes('owner') ? 403 : 400).json({ error: result.error });
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

// ── Search users ────────────────────────────────────────────────────────────
router.get('/users/search', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const q = req.query.q as string;
  if (!q || q.trim().length < 2) return res.status(400).json({ error: 'Query too short' });
  res.json({ users: svc.searchUsersForInvite(userId, q) });
});

export default router;
