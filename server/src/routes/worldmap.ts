import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { db } from '../db/database';

const router = express.Router();
router.use(authenticate);

interface WorldMapEntry {
  id: number;
  country_code: string;
  name: string;
  description: string | null;
  category: string;
  lat: number | null;
  lng: number | null;
  added_by: number | null;
  added_by_username: string | null;
  created_at: string;
}

// ── List entries (optionally filtered by country) ──────────────────────────
router.get('/entries', (req: Request, res: Response) => {
  try {
    const country = (req.query.country as string | undefined)?.toUpperCase();
    const entries = country
      ? db.prepare('SELECT * FROM world_map_entries WHERE country_code = ? ORDER BY created_at DESC').all(country) as WorldMapEntry[]
      : db.prepare('SELECT * FROM world_map_entries ORDER BY created_at DESC').all() as WorldMapEntry[];
    res.json({ entries });
  } catch (err) {
    console.error('Error fetching world map entries:', err);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// ── Countries with entry counts ────────────────────────────────────────────
router.get('/countries', (_req: Request, res: Response) => {
  try {
    const counts = db.prepare(
      'SELECT country_code, COUNT(*) as count FROM world_map_entries GROUP BY country_code'
    ).all() as { country_code: string; count: number }[];
    res.json({ countries: counts });
  } catch (err) {
    console.error('Error fetching world map countries:', err);
    res.status(500).json({ error: 'Failed to fetch countries' });
  }
});

// ── Add entry ──────────────────────────────────────────────────────────────
router.post('/entries', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const { country_code, name, description, category, lat, lng } = req.body;

  if (!country_code || !name?.trim()) {
    return res.status(400).json({ error: 'country_code and name are required' });
  }

  const validCategories = ['place', 'food', 'tip', 'accommodation', 'activity', 'other'];
  const cat = validCategories.includes(category) ? category : 'place';

  try {
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string } | undefined;
    const result = db.prepare(
      'INSERT INTO world_map_entries (country_code, name, description, category, lat, lng, added_by, added_by_username) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      country_code.toUpperCase(),
      name.trim(),
      description?.trim() || null,
      cat,
      lat ?? null,
      lng ?? null,
      userId,
      user?.username || null
    );
    const entry = db.prepare('SELECT * FROM world_map_entries WHERE id = ?').get(result.lastInsertRowid) as WorldMapEntry;
    res.status(201).json({ entry });
  } catch (err) {
    console.error('Error adding world map entry:', err);
    res.status(500).json({ error: 'Failed to add entry' });
  }
});

// ── Delete entry (own or admin) ────────────────────────────────────────────
router.delete('/entries/:id', (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const { id } = req.params;

  try {
    const entry = db.prepare('SELECT added_by FROM world_map_entries WHERE id = ?').get(id) as { added_by: number | null } | undefined;
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
    if (entry.added_by !== userId && user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    db.prepare('DELETE FROM world_map_entries WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting world map entry:', err);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

export default router;
