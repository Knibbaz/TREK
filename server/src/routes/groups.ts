import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { db } from '../db/database';
import * as svc from '../services/groupsService';
import { broadcastToGroup, broadcast } from '../websocket';
import { NextFunction } from 'express';

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
  if (!role || (role !== 'admin' && role !== 'member')) return res.status(400).json({ error: 'role must be admin or member' });
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
