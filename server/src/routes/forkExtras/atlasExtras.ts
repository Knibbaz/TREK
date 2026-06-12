import express, { Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { AuthRequest } from '../../types';
import {
  getStats,
  getCountryPlaces,
  markCountryVisited,
  unmarkCountryVisited,
  markRegionVisited,
  unmarkRegionVisited,
  getVisitedRegions,
  getRegionGeo,
  listBucketList,
  createBucketItem,
  updateBucketItem,
  deleteBucketItem,
  listResidency,
  createResidency,
  deleteResidency,
  listVolunteering,
  createVolunteering,
  deleteVolunteering,
} from '../../services/atlasService';

const router = express.Router();
router.use(authenticate);

router.get('/residency', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  res.json({ items: listResidency(userId) });
});

router.post('/residency', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const { country_code, city, start_date, end_date, notes } = req.body;
  if (!country_code?.trim()) return res.status(400).json({ error: 'country_code is required' });
  try {
    const item = createResidency(userId, { country_code: country_code.trim(), city, start_date, end_date, notes });
    res.status(201).json({ item });
  } catch (e: any) {
    if (e.message?.includes('UNIQUE constraint failed')) return res.status(409).json({ error: 'Residency for this country already exists' });
    throw e;
  }
});

router.delete('/residency/:id', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const deleted = deleteResidency(userId, parseInt(req.params.id));
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

router.get('/volunteering', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  res.json({ items: listVolunteering(userId) });
});

router.post('/volunteering', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const { country_code, city, organization, start_date, end_date, notes } = req.body;
  if (!country_code?.trim()) return res.status(400).json({ error: 'country_code is required' });
  try {
    const item = createVolunteering(userId, { country_code: country_code.trim(), city, organization, start_date, end_date, notes });
    res.status(201).json({ item });
  } catch (e: any) {
    if (e.message?.includes('UNIQUE constraint failed')) return res.status(409).json({ error: 'Volunteering for this country already exists' });
    throw e;
  }
});

router.delete('/volunteering/:id', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const deleted = deleteVolunteering(userId, parseInt(req.params.id));
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});


export default router;
