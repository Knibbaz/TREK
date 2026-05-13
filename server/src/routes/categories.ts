import express, { Request, Response } from 'express';
import { authenticate, adminOnly, adminOrCreator } from '../middleware/auth';
import { AuthRequest } from '../types';
import * as categoryService from '../services/categoryService';

const router = express.Router();

// ── List categories (global + own) ──────────────────────────────────────────
router.get('/', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const categories = categoryService.listCategoriesForUser(authReq.user.id);
  res.json({ categories });
});

// ── List my own categories ──────────────────────────────────────────────────
router.get('/my', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const categories = categoryService.listMyCategories(authReq.user.id);
  res.json({ categories });
});

// ── Create category ─────────────────────────────────────────────────────────
router.post('/', authenticate, adminOrCreator, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { name, color, icon } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required' });

  // Admin creates global categories (user_id = null), creators create personal ones
  const isAdmin = authReq.user.role === 'admin';
  const userId = isAdmin ? null : authReq.user.id;

  const category = categoryService.createCategory(userId, name, color, icon);
  res.status(201).json({ category });
});

// ── Update category ─────────────────────────────────────────────────────────
router.put('/:id', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { id } = req.params;

  if (!categoryService.canModifyCategory(authReq.user.id, authReq.user.role, id)) {
    return res.status(403).json({ error: 'Not authorized to update this category' });
  }

  if (!categoryService.getCategoryById(id))
    return res.status(404).json({ error: 'Category not found' });

  const { name, color, icon } = req.body;
  const category = categoryService.updateCategory(id, name, color, icon);
  res.json({ category });
});

// ── Delete category ─────────────────────────────────────────────────────────
router.delete('/:id', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { id } = req.params;

  if (!categoryService.canModifyCategory(authReq.user.id, authReq.user.role, id)) {
    return res.status(403).json({ error: 'Not authorized to delete this category' });
  }

  if (!categoryService.getCategoryById(id))
    return res.status(404).json({ error: 'Category not found' });

  categoryService.deleteCategory(id);
  res.json({ success: true });
});

export default router;
