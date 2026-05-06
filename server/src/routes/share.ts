import express, { Request, Response } from 'express';
import { canAccessTrip } from '../db/database';
import { authenticate } from '../middleware/auth';
import { checkPermission } from '../services/permissions';
import { AuthRequest } from '../types';
import * as shareService from '../services/shareService';
import { copyTripById } from '../services/tripService';

const router = express.Router();

// Create a share link for a trip (owner/member only)
router.post('/trips/:tripId/share-link', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { tripId } = req.params;
  const access = canAccessTrip(tripId, authReq.user.id);
  if (!access) return res.status(404).json({ error: 'Trip not found' });
  if (!checkPermission('share_manage', authReq.user.role, access.user_id, authReq.user.id, access.user_id !== authReq.user.id))
    return res.status(403).json({ error: 'No permission' });

  const { share_map, share_plan, share_bookings, share_packing, share_budget, share_collab, allow_clone, share_description } = req.body || {};
  const result = shareService.createOrUpdateShareLink(tripId, authReq.user.id, {
    share_map, share_plan, share_bookings, share_packing, share_budget, share_collab, allow_clone, share_description,
  });

  if (result.created) {
    return res.status(201).json({ token: result.token });
  }
  return res.json({ token: result.token });
});

// Get share link status
router.get('/trips/:tripId/share-link', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { tripId } = req.params;
  if (!canAccessTrip(tripId, authReq.user.id)) return res.status(404).json({ error: 'Trip not found' });

  const info = shareService.getShareLinks(tripId);
  res.json(info ? info : { token: null });
});

// Delete share link
router.delete('/trips/:tripId/share-link', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { tripId } = req.params;
  const access = canAccessTrip(tripId, authReq.user.id);
  if (!access) return res.status(404).json({ error: 'Trip not found' });
  if (!checkPermission('share_manage', authReq.user.role, access.user_id, authReq.user.id, access.user_id !== authReq.user.id))
    return res.status(403).json({ error: 'No permission' });

  shareService.deleteShareLink(tripId);
  res.json({ success: true });
});

// Public read-only trip data (no auth required)
router.get('/shared/:token', (req: Request, res: Response) => {
  const { token } = req.params;
  const data = shareService.getSharedTripData(token);
  if (!data) return res.status(404).json({ error: 'Invalid or expired link' });
  res.json(data);
});

// Create / rotate collab invite link
router.post('/trips/:tripId/collab-invite', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { tripId } = req.params;
  const access = canAccessTrip(tripId, authReq.user.id);
  if (!access) return res.status(404).json({ error: 'Trip not found' });
  if (!checkPermission('share_manage', authReq.user.role, access.user_id, authReq.user.id, access.user_id !== authReq.user.id))
    return res.status(403).json({ error: 'No permission' });

  const token = shareService.createCollabInviteToken(tripId, authReq.user.id);
  res.status(201).json({ token });
});

// Get collab invite link status
router.get('/trips/:tripId/collab-invite', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { tripId } = req.params;
  const access = canAccessTrip(tripId, authReq.user.id);
  if (!access) return res.status(404).json({ error: 'Trip not found' });

  const info = shareService.getCollabInviteToken(tripId);
  if (!info) return res.json({ token: null });

  // Non-managers only see the token if visible_to_members is enabled
  const isManager = checkPermission('share_manage', authReq.user.role, access.user_id, authReq.user.id, access.user_id !== authReq.user.id);
  if (!isManager && !info.visible_to_members) return res.json({ token: null, visible_to_members: false });

  res.json(info);
});

// Update collab invite visibility
router.patch('/trips/:tripId/collab-invite', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { tripId } = req.params;
  const access = canAccessTrip(tripId, authReq.user.id);
  if (!access) return res.status(404).json({ error: 'Trip not found' });
  if (!checkPermission('share_manage', authReq.user.role, access.user_id, authReq.user.id, access.user_id !== authReq.user.id))
    return res.status(403).json({ error: 'No permission' });

  const { visible_to_members } = req.body || {};
  shareService.setCollabInviteVisibility(tripId, !!visible_to_members);
  res.json({ success: true });
});

// Revoke collab invite link
router.delete('/trips/:tripId/collab-invite', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { tripId } = req.params;
  const access = canAccessTrip(tripId, authReq.user.id);
  if (!access) return res.status(404).json({ error: 'Trip not found' });
  if (!checkPermission('share_manage', authReq.user.role, access.user_id, authReq.user.id, access.user_id !== authReq.user.id))
    return res.status(403).json({ error: 'No permission' });

  shareService.revokeCollabInviteToken(tripId);
  res.json({ success: true });
});

// Preview a collab invite (no auth required — shows trip title before login)
router.get('/invite/trip/:token', (req: Request, res: Response) => {
  const info = shareService.validateCollabInviteToken(req.params.token);
  if (!info) return res.status(404).json({ error: 'Invalid or expired invite' });
  res.json({ tripTitle: info.tripTitle });
});

// Accept a collab invite (auth required)
router.post('/invite/trip/:token/join', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const result = shareService.joinTripWithCollabToken(req.params.token, authReq.user.id);
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json({ tripId: result.tripId });
});

// Clone a shared trip into the authenticated user's account
router.post('/shared/:token/clone', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { token } = req.params;
  const data = shareService.getSharedTripData(token);
  if (!data) return res.status(404).json({ error: 'Invalid or expired link' });
  if (!data.permissions?.allow_clone) return res.status(403).json({ error: 'Cloning not allowed for this link' });

  const newTripId = copyTripById(data.trip.id, authReq.user.id);
  res.status(201).json({ tripId: newTripId });
});

export default router;
