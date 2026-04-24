import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { db } from '../db/database';

const router = express.Router();
router.use(authenticate);

// ── Holiday cache (shared in-process, same as vacayService) ─────────────────
const holidayCache = new Map<string, { data: unknown; time: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

// ── Vacation Days ───────────────────────────────────────────────────────────

interface VacationDay {
  id: number;
  user_id: number;
  start_date: string;
  end_date: string;
  label: string | null;
  color: string;
}

router.get('/vacation-days', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const rows = db.prepare(
    'SELECT id, user_id, start_date, end_date, label, color FROM user_vacation_days WHERE user_id = ? ORDER BY start_date'
  ).all(userId) as VacationDay[];
  res.json({ vacationDays: rows });
});

router.post('/vacation-days', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const { start_date, end_date, label, color } = req.body;
  if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date are required' });
  if (end_date < start_date) return res.status(400).json({ error: 'end_date must be after start_date' });

  const info = db.prepare(
    'INSERT INTO user_vacation_days (user_id, start_date, end_date, label, color) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, start_date, end_date, label || null, color || '#3b82f6');

  const row = db.prepare(
    'SELECT id, user_id, start_date, end_date, label, color FROM user_vacation_days WHERE id = ?'
  ).get(info.lastInsertRowid) as VacationDay;
  res.status(201).json({ vacationDay: row });
});

router.delete('/vacation-days/:id', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT user_id FROM user_vacation_days WHERE id = ?').get(id) as { user_id: number } | undefined;
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (existing.user_id !== userId) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM user_vacation_days WHERE id = ?').run(id);
  res.json({ success: true });
});

// ── Company Holidays ────────────────────────────────────────────────────────

interface CompanyHoliday {
  id: number;
  date: string;
  name: string;
  color: string;
}

router.get('/company-holidays', (_req: Request, res: Response) => {
  const year = new Date().getFullYear();
  const start = `${year}-01-01`;
  const end = `${year + 1}-12-31`;
  const rows = db.prepare(
    'SELECT id, date, name, color FROM company_holidays WHERE date >= ? AND date <= ? ORDER BY date'
  ).all(start, end) as CompanyHoliday[];
  res.json({ companyHolidays: rows });
});

router.post('/company-holidays', (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  if (authReq.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const { date, name, color } = req.body;
  if (!date || !name) return res.status(400).json({ error: 'date and name are required' });

  try {
    const info = db.prepare(
      'INSERT INTO company_holidays (date, name, color, created_by) VALUES (?, ?, ?, ?)'
    ).run(date, name, color || '#ef4444', authReq.user.id);
    const row = db.prepare('SELECT id, date, name, color FROM company_holidays WHERE id = ?').get(info.lastInsertRowid) as CompanyHoliday;
    res.status(201).json({ companyHoliday: row });
  } catch (e: any) {
    if (e.message?.includes('UNIQUE constraint failed')) return res.status(409).json({ error: 'Holiday for this date already exists' });
    throw e;
  }
});

router.delete('/company-holidays/:id', (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  if (authReq.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const id = parseInt(req.params.id);
  db.prepare('DELETE FROM company_holidays WHERE id = ?').run(id);
  res.json({ success: true });
});

// ── Public Holidays (Nager.Date proxy) ──────────────────────────────────────

router.get('/holidays/countries', async (_req: Request, res: Response) => {
  const cacheKey = 'countries';
  const cached = holidayCache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return res.json({ countries: cached.data });
  }
  try {
    const resp = await fetch('https://date.nager.at/api/v3/AvailableCountries');
    const data = await resp.json();
    holidayCache.set(cacheKey, { data, time: Date.now() });
    res.json({ countries: data });
  } catch {
    res.status(502).json({ error: 'Failed to fetch countries' });
  }
});

router.get('/holidays/:year/:country', async (req: Request, res: Response) => {
  const { year, country } = req.params;
  const cacheKey = `${year}-${country}`;
  const cached = holidayCache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return res.json({ holidays: cached.data });
  }
  try {
    const resp = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`);
    const data = await resp.json();
    holidayCache.set(cacheKey, { data, time: Date.now() });
    res.json({ holidays: data });
  } catch {
    res.status(502).json({ error: 'Failed to fetch holidays' });
  }
});

export default router;
