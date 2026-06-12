import express, { Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { AuthRequest } from '../../types';
import * as svc from '../../services/vacayService';

const router = express.Router();
router.use(authenticate);

router.post('/entries/set', (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { date, hours, type, target_user_id } = req.body;
  if (!date) return res.status(400).json({ error: 'date required' });
  const entryType: 'vacation' | 'comp' | 'tvt' = type === 'comp' ? 'comp' : type === 'tvt' ? 'tvt' : 'vacation';
  const planId = svc.getActivePlanId(authReq.user.id);
  let userId = authReq.user.id;
  if (target_user_id && parseInt(target_user_id) !== authReq.user.id) {
    const planUsers = svc.getPlanUsers(planId);
    const tid = parseInt(target_user_id);
    if (!planUsers.find(u => u.id === tid)) {
      return res.status(403).json({ error: 'User not in plan' });
    }
    userId = tid;
  }
  const parsedHours = hours != null ? parseFloat(hours) : null;
  const result = svc.upsertEntry(userId, planId, date, parsedHours, entryType, req.headers['x-socket-id'] as string);
  if (result.action === 'error') return res.status(400).json({ error: result.error });
  res.json(result);
});


export default router;
