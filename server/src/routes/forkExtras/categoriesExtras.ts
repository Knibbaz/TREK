import express, { Request, Response } from 'express';
import { authenticate, adminOnly, adminOrCreator } from '../../middleware/auth';
import { AuthRequest } from '../../types';
import * as categoryService from '../../services/categoryService';

const router = express.Router();

// ── List categories (global + own) ──────────────────────────────────────────
router.get('/my', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const categories = categoryService.listMyCategories(authReq.user.id);
  res.json({ categories });
});


export default router;
