import express, { Request, Response } from 'express';
import { canAccessTrip } from '../../db/database';
import { authenticate } from '../../middleware/auth';
import { checkPermission } from '../../services/permissions';
import { AuthRequest } from '../../types';
import * as shareService from '../../services/shareService';
import { copyTripById } from '../../services/tripService';

const router = express.Router();

// Create a share link for a trip (owner/member only)
router.get('/trips/:tripId/share-visits', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { tripId } = req.params;

  // Only admins can see visitor stats
  if (authReq.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can view visitor statistics' });
  }

  if (!canAccessTrip(tripId, authReq.user.id)) return res.status(404).json({ error: 'Trip not found' });

  const shareLinks = shareService.getShareLinks(tripId);
  if (!shareLinks?.token) return res.status(404).json({ error: 'No share link found' });

  const stats = shareService.getShareVisitStats(shareLinks.token);
  res.json(stats || { uniqueVisitors: 0, recentVisits: [] });
});

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

router.get('/invite/trip/:token', (req: Request, res: Response) => {
  const info = shareService.validateCollabInviteToken(req.params.token);
  if (!info) return res.status(404).json({ error: 'Invalid or expired invite' });
  res.json({ tripTitle: info.tripTitle });
});

router.post('/invite/trip/:token/join', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const result = shareService.joinTripWithCollabToken(req.params.token, authReq.user.id);
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json({ tripId: result.tripId });
});

router.post('/shared/:token/clone', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { token } = req.params;
  const data = shareService.getSharedTripData(token);
  if (!data) return res.status(404).json({ error: 'Invalid or expired link' });
  if (!data.permissions?.allow_clone) return res.status(403).json({ error: 'Cloning not allowed for this link' });

  const newTripId = copyTripById(data.trip.id, authReq.user.id, undefined, true);
  res.status(201).json({ tripId: newTripId });
});


export default router;
