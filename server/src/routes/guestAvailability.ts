import express, { Request, Response } from 'express';
import { db } from '../db/database';

const router = express.Router();

// ── GET /guest/availability/:token ────────────────────────────────────────────
// Public endpoint: returns proposal info + existing guest responses for this token

router.get('/:token', (req: Request, res: Response) => {
  const { token } = req.params;

  const guestToken = db.prepare(`
    SELECT t.*, dp.id AS proposal_id, dp.title, dp.period_start, dp.period_end, g.name AS group_name
    FROM date_proposal_guest_tokens t
    JOIN date_proposals dp ON dp.id = t.proposal_id
    JOIN groups g ON g.id = dp.group_id
    WHERE t.token = ?
  `).get(token) as {
    id: number; token: string; proposal_id: number; title: string; period_start: string; period_end: string;
    group_name: string; guest_name: string | null; expires_at: string | null;
  } | undefined;

  if (!guestToken) return res.status(404).json({ error: 'Invalid or expired link' });

  if (guestToken.expires_at && new Date(guestToken.expires_at) < new Date()) {
    return res.status(410).json({ error: 'This link has expired' });
  }

  const existingResponses = db.prepare(`
    SELECT date, status, note FROM date_availability_guests
    WHERE proposal_id = ? AND guest_token_id = ?
  `).all(guestToken.proposal_id, guestToken.id) as Array<{ date: string; status: string; note: string | null }>;

  const responses: Record<string, 'yes' | 'no' | 'maybe'> = {};
  const notes: Record<string, string> = {};
  for (const r of existingResponses) {
    responses[r.date] = r.status as 'yes' | 'no' | 'maybe';
    if (r.note) notes[r.date] = r.note;
  }

  res.json({
    proposal: {
      id: guestToken.proposal_id,
      title: guestToken.title,
      period_start: guestToken.period_start,
      period_end: guestToken.period_end,
      group_name: guestToken.group_name,
    },
    guestName: guestToken.guest_name,
    tokenId: guestToken.id,
    responses,
    notes,
  });
});

// ── PUT /guest/availability/:token ────────────────────────────────────────────
// Public endpoint: save/update guest availability responses

router.put('/:token', (req: Request, res: Response) => {
  const { token } = req.params;
  const { guest_name, responses, notes } = req.body as {
    guest_name?: string;
    responses: Record<string, 'yes' | 'no' | 'maybe' | null>;
    notes?: Record<string, string | null>;
  };

  if (!responses || typeof responses !== 'object') {
    return res.status(400).json({ error: 'responses object required' });
  }

  const guestToken = db.prepare(`
    SELECT t.*, dp.period_start, dp.period_end, dp.status AS proposal_status
    FROM date_proposal_guest_tokens t
    JOIN date_proposals dp ON dp.id = t.proposal_id
    WHERE t.token = ?
  `).get(token) as {
    id: number; proposal_id: number; period_start: string; period_end: string;
    proposal_status: string | null; expires_at: string | null;
  } | undefined;

  if (!guestToken) return res.status(404).json({ error: 'Invalid or expired link' });

  if (guestToken.expires_at && new Date(guestToken.expires_at) < new Date()) {
    return res.status(410).json({ error: 'This link has expired' });
  }

  if (guestToken.proposal_status === 'confirmed') {
    return res.status(403).json({ error: 'Proposal is confirmed and read-only' });
  }

  const start = new Date(guestToken.period_start + 'T00:00:00');
  const end = new Date(guestToken.period_end + 'T00:00:00');
  const VALID = new Set(['yes', 'no', 'maybe']);

  // Update guest name if provided
  if (guest_name && guest_name.trim()) {
    db.prepare('UPDATE date_proposal_guest_tokens SET guest_name = ? WHERE id = ?').run(guest_name.trim().slice(0, 100), guestToken.id);
  }

  const upsert = db.prepare(`
    INSERT INTO date_availability_guests (proposal_id, guest_token_id, date, status)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(proposal_id, guest_token_id, date) DO UPDATE SET status = excluded.status
  `);
  const upsertNote = db.prepare(`
    INSERT INTO date_availability_guests (proposal_id, guest_token_id, date, status, note)
    VALUES (?, ?, ?, 'yes', ?)
    ON CONFLICT(proposal_id, guest_token_id, date) DO UPDATE SET note = excluded.note
  `);
  const clearNote = db.prepare(`
    UPDATE date_availability_guests SET note = NULL WHERE proposal_id = ? AND guest_token_id = ? AND date = ?
  `);
  const del = db.prepare(`
    DELETE FROM date_availability_guests WHERE proposal_id = ? AND guest_token_id = ? AND date = ?
  `);

  db.transaction(() => {
    for (const [date, status] of Object.entries(responses)) {
      const d = new Date(date);
      if (isNaN(d.getTime()) || d < start || d > end) continue;
      if (status === null || status === undefined) {
        del.run(guestToken.proposal_id, guestToken.id, date);
      } else if (VALID.has(status)) {
        upsert.run(guestToken.proposal_id, guestToken.id, date, status);
      }
    }
    if (notes && typeof notes === 'object') {
      for (const [date, note] of Object.entries(notes)) {
        const d = new Date(date);
        if (isNaN(d.getTime()) || d < start || d > end) continue;
        if (note === null || note === undefined || note === '') {
          clearNote.run(guestToken.proposal_id, guestToken.id, date);
        } else {
          upsertNote.run(guestToken.proposal_id, guestToken.id, date, note.slice(0, 200));
        }
      }
    }
  })();

  res.json({ ok: true });
});

export default router;
