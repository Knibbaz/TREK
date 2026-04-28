import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { db } from '../db/database';
import { broadcast } from '../websocket';

const router = express.Router({ mergeParams: true });

// ── auth helpers ──────────────────────────────────────────────────────────────

function getGroupAccess(groupId: string, userId: number): { role: string } | null {
  const row = db.prepare(`
    SELECT role FROM group_members WHERE group_id = ? AND user_id = ?
  `).get(groupId, userId) as { role: string } | undefined;
  return row || null;
}

function canEdit(role: string): boolean {
  return role === 'owner' || role === 'admin' || role === 'member';
}

function getGroupMembers(groupId: string): Array<{ id: number; username: string; avatar_url: string | null }> {
  return db.prepare(`
    SELECT u.id, u.username, u.avatar AS avatar_url
    FROM group_members gm JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY CASE gm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.username
  `).all(groupId) as Array<{ id: number; username: string; avatar_url: string | null }>;
}

// ── GET /groups/:groupId/date-proposals ───────────────────────────────────────

router.get('/', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { groupId } = req.params;
  const access = getGroupAccess(groupId, authReq.user.id);
  if (!access) return res.status(404).json({ error: 'Group not found' });

  const proposals = db.prepare(`
    SELECT dp.*, u.username AS creator_name
    FROM date_proposals dp JOIN users u ON u.id = dp.created_by
    WHERE dp.group_id = ?
    ORDER BY dp.created_at DESC
  `).all(groupId) as Array<Record<string, unknown>>;

  const members = getGroupMembers(groupId);

  // Fetch member holiday regions from settings
  const memberRegions: Record<number, string> = {};
  for (const m of members) {
    const regionRow = db.prepare("SELECT value FROM settings WHERE user_id = ? AND key = 'holiday_region'").get(m.id) as { value: string } | undefined;
    if (regionRow?.value) memberRegions[m.id] = regionRow.value;
  }

  // Fetch all group members' vacation days that overlap any proposal period
  const memberIds = members.map(m => m.id).join(',');
  const vacationDays = memberIds
    ? db.prepare(`
        SELECT id, user_id, start_date, end_date, label, color
        FROM user_vacation_days
        WHERE user_id IN (${memberIds})
      `).all() as Array<{ id: number; user_id: number; start_date: string; end_date: string; label: string | null; color: string }>
    : [];

  // Fetch scheduled vacay_entries (type='vacation') for group members
  const vacayEntries = memberIds
    ? db.prepare(`
        SELECT user_id, date
        FROM vacay_entries
        WHERE user_id IN (${memberIds}) AND type = 'vacation'
      `).all() as Array<{ user_id: number; date: string }>
    : [];

  // Fetch company holidays for the current + next year
  const currentYear = new Date().getFullYear();
  const companyHolidays = db.prepare(
    'SELECT id, date, name, color FROM company_holidays WHERE date >= ? AND date <= ? ORDER BY date'
  ).all(`${currentYear}-01-01`, `${currentYear + 1}-12-31`) as Array<{ id: number; date: string; name: string; color: string }>;

  const result = proposals.map(p => {
    const proposalStart = p.period_start as string;
    const proposalEnd = p.period_end as string;

    const availability = db.prepare(`
      SELECT da.user_id, da.date, da.status, da.note, u.username
      FROM date_availability da JOIN users u ON u.id = da.user_id
      WHERE da.proposal_id = ?
    `).all(p.id) as Array<{ user_id: number; date: string; status: string; note: string | null; username: string }>;

    // Filter vacation days overlapping this proposal
    const overlappingVacation = vacationDays.filter(v =>
      v.start_date <= proposalEnd && v.end_date >= proposalStart
    );

    // Filter company holidays within proposal range
    const overlappingCompany = companyHolidays.filter(h =>
      h.date >= proposalStart && h.date <= proposalEnd
    );

    // Filter vacay_entries within proposal range
    const overlappingVacayEntries = vacayEntries.filter(e =>
      e.date >= proposalStart && e.date <= proposalEnd
    );

    // Fetch guest tokens for this proposal
    const guestTokens = db.prepare(`
      SELECT id, token, guest_name, created_at, expires_at FROM date_proposal_guest_tokens
      WHERE proposal_id = ?
    `).all(p.id) as Array<{ id: number; token: string; guest_name: string | null; created_at: string; expires_at: string | null }>;

    // Fetch guest availability responses
    const guestAvailability = db.prepare(`
      SELECT dag.date, dag.status, dag.note, t.id AS guest_token_id, t.guest_name
      FROM date_availability_guests dag
      JOIN date_proposal_guest_tokens t ON t.id = dag.guest_token_id
      WHERE dag.proposal_id = ?
    `).all(p.id) as Array<{ date: string; status: string; note: string | null; guest_token_id: number; guest_name: string | null }>;

    return {
      ...p,
      availability,
      guestAvailability,
      guestTokens,
      members,
      memberRegions,
      vacationDays: overlappingVacation,
      companyHolidays: overlappingCompany,
      vacayEntries: overlappingVacayEntries,
    };
  });

  res.json({ proposals: result });
});

// ── POST /groups/:groupId/date-proposals ──────────────────────────────────────

router.post('/', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { groupId } = req.params;
  const access = getGroupAccess(groupId, authReq.user.id);
  if (!access) return res.status(404).json({ error: 'Group not found' });
  if (!canEdit(access.role)) return res.status(403).json({ error: 'No permission' });

  let { title, period_start, period_end, deadline, reminder_days } = req.body;
  if (!period_start || !period_end) return res.status(400).json({ error: 'period_start and period_end are required' });

  // Generate a default title from the date range if not provided
  if (!title || !title.trim()) {
    const startFmt = new Date(period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const endFmt = new Date(period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    title = startFmt === endFmt ? startFmt : `${startFmt} – ${endFmt}`;
  }

  const start = new Date(period_start);
  const end = new Date(period_end);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return res.status(400).json({ error: 'Invalid dates' });
  if (end < start) return res.status(400).json({ error: 'period_end must be after period_start' });
  const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1;
  if (days > 366) return res.status(400).json({ error: 'Period cannot exceed 366 days' });

  const deadlineVal = deadline && !isNaN(new Date(deadline).getTime()) ? deadline : null;
  const reminderDaysVal = Number.isInteger(Number(reminder_days)) && Number(reminder_days) >= 0 ? Number(reminder_days) : 2;

  const info = db.prepare(`
    INSERT INTO date_proposals (group_id, created_by, title, period_start, period_end, deadline, reminder_days)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(groupId, authReq.user.id, title.trim() || title, period_start, period_end, deadlineVal, reminderDaysVal);

  const proposal = db.prepare(`
    SELECT dp.*, u.username AS creator_name
    FROM date_proposals dp JOIN users u ON u.id = dp.created_by
    WHERE dp.id = ?
  `).get(info.lastInsertRowid) as Record<string, unknown>;

  const members = getGroupMembers(groupId);
  const result = { ...proposal, availability: [], members };

  res.status(201).json({ proposal: result });
  broadcast(String(groupId), 'dateProposal:created', { proposal: result }, req.headers['x-socket-id'] as string);
});

// ── DELETE /groups/:groupId/date-proposals/:proposalId ────────────────────────

router.delete('/:proposalId', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { groupId, proposalId } = req.params;
  const access = getGroupAccess(groupId, authReq.user.id);
  if (!access) return res.status(404).json({ error: 'Group not found' });

  const proposal = db.prepare('SELECT * FROM date_proposals WHERE id = ? AND group_id = ?').get(proposalId, groupId) as { created_by: number } | undefined;
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

  const isOwnerAdmin = access.role === 'owner' || access.role === 'admin';
  if (!isOwnerAdmin && proposal.created_by !== authReq.user.id) return res.status(403).json({ error: 'No permission' });

  db.prepare('DELETE FROM date_proposals WHERE id = ?').run(proposalId);
  res.json({ ok: true });
  broadcast(groupId, 'dateProposal:deleted', { proposalId: Number(proposalId) }, req.headers['x-socket-id'] as string);
});

// ── PUT /groups/:groupId/date-proposals/:proposalId/availability ──────────────
// Body: { responses: { "2025-06-01": "yes"|"no"|"maybe"|null, ... } }

router.put('/:proposalId/availability', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { groupId, proposalId } = req.params;
  const access = getGroupAccess(groupId, authReq.user.id);
  if (!access) return res.status(404).json({ error: 'Group not found' });

  const proposal = db.prepare('SELECT * FROM date_proposals WHERE id = ? AND group_id = ?').get(proposalId, groupId) as { period_start: string; period_end: string; status?: string } | undefined;
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

  if (proposal.status === 'confirmed') return res.status(403).json({ error: 'Proposal is confirmed and read-only' });

  const { responses, notes } = req.body as { responses: Record<string, 'yes' | 'no' | 'maybe' | null>; notes?: Record<string, string | null> };
  if (!responses || typeof responses !== 'object') return res.status(400).json({ error: 'responses object required' });

  const start = new Date(proposal.period_start);
  const end = new Date(proposal.period_end);
  const VALID = new Set(['yes', 'no', 'maybe']);

  const upsert = db.prepare(`
    INSERT INTO date_availability (proposal_id, user_id, date, status)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(proposal_id, user_id, date) DO UPDATE SET status = excluded.status
  `);
  const upsertNote = db.prepare(`
    INSERT INTO date_availability (proposal_id, user_id, date, status, note)
    VALUES (?, ?, ?, 'yes', ?)
    ON CONFLICT(proposal_id, user_id, date) DO UPDATE SET note = excluded.note
  `);
  const clearNote = db.prepare(`
    UPDATE date_availability SET note = NULL WHERE proposal_id = ? AND user_id = ? AND date = ?
  `);
  const del = db.prepare(`
    DELETE FROM date_availability WHERE proposal_id = ? AND user_id = ? AND date = ?
  `);

  db.transaction(() => {
    for (const [date, status] of Object.entries(responses)) {
      const d = new Date(date);
      if (isNaN(d.getTime()) || d < start || d > end) continue;
      if (status === null || status === undefined) {
        del.run(proposalId, authReq.user.id, date);
      } else if (VALID.has(status)) {
        upsert.run(proposalId, authReq.user.id, date, status);
      }
    }
    if (notes && typeof notes === 'object') {
      for (const [date, note] of Object.entries(notes)) {
        const d = new Date(date);
        if (isNaN(d.getTime()) || d < start || d > end) continue;
        if (note === null || note === undefined || note === '') {
          clearNote.run(proposalId, authReq.user.id, date);
        } else {
          upsertNote.run(proposalId, authReq.user.id, date, note.slice(0, 200));
        }
      }
    }
  })();

  const availability = db.prepare(`
    SELECT da.user_id, da.date, da.status, da.note, u.username
    FROM date_availability da JOIN users u ON u.id = da.user_id
    WHERE da.proposal_id = ?
  `).all(proposalId) as Array<{ user_id: number; date: string; status: string; note: string | null; username: string }>;

  res.json({ availability });
  broadcast(groupId, 'dateProposal:availabilityUpdated', {
    proposalId: Number(proposalId),
    userId: authReq.user.id,
    availability,
  }, req.headers['x-socket-id'] as string);
});

// ── GET /groups/:groupId/date-proposals/:proposalId/analysis ──────────────────

router.get('/:proposalId/analysis', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { groupId, proposalId } = req.params;
  const access = getGroupAccess(groupId, authReq.user.id);
  if (!access) return res.status(404).json({ error: 'Group not found' });

  const proposal = db.prepare('SELECT * FROM date_proposals WHERE id = ? AND group_id = ?').get(proposalId, groupId) as { period_start: string; period_end: string } | undefined;
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

  const minDays = Math.max(1, parseInt(String(req.query.min_days || '3')));
  const maxSuggestions = Math.max(1, Math.min(10, parseInt(String(req.query.max_suggestions || '5'))));

  const members = getGroupMembers(groupId);
  const totalMembers = members.length;

  const rows = db.prepare(`
    SELECT da.date, da.status FROM date_availability da
    WHERE da.proposal_id = ?
  `).all(proposalId) as Array<{ date: string; status: string }>;

  // Also include guest responses
  const guestRows = db.prepare(`
    SELECT dag.date, dag.status FROM date_availability_guests dag
    WHERE dag.proposal_id = ?
  `).all(proposalId) as Array<{ date: string; status: string }>;

  const allRows = [...rows, ...guestRows];
  const respondedUserIds = new Set(
    (db.prepare('SELECT DISTINCT user_id FROM date_availability WHERE proposal_id = ?').all(proposalId) as Array<{ user_id: number }>).map(r => r.user_id)
  );
  const respondedGuests = (db.prepare('SELECT DISTINCT guest_token_id FROM date_availability_guests WHERE proposal_id = ?').all(proposalId) as Array<{ guest_token_id: number }>).length;
  const totalResponded = respondedUserIds.size + respondedGuests;

  // Build per-day score map
  const dayMap: Record<string, { yes: number; maybe: number; no: number }> = {};
  for (const row of allRows) {
    if (!dayMap[row.date]) dayMap[row.date] = { yes: 0, maybe: 0, no: 0 };
    if (row.status === 'yes') dayMap[row.date].yes++;
    else if (row.status === 'maybe') dayMap[row.date].maybe++;
    else if (row.status === 'no') dayMap[row.date].no++;
  }

  // Build sorted list of all dates in the period
  const dates: string[] = [];
  const pStart = new Date(proposal.period_start + 'T00:00:00');
  const pEnd = new Date(proposal.period_end + 'T00:00:00');
  for (const d = new Date(pStart); d <= pEnd; d.setDate(d.getDate() + 1)) {
    const pad = (n: number) => String(n).padStart(2, '0');
    dates.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }

  const scoreFor = (date: string) => {
    const m = dayMap[date];
    if (!m) return 0;
    return m.yes + 0.5 * m.maybe;
  };

  const perDayOverlap = dates.map(date => {
    const m = dayMap[date] || { yes: 0, maybe: 0, no: 0 };
    return { date, yes: m.yes, maybe: m.maybe, no: m.no, total: totalMembers, score: scoreFor(date) };
  });

  const overallAvgScore = perDayOverlap.reduce((s, d) => s + d.score, 0) / Math.max(perDayOverlap.length, 1);

  // Sliding window: find best contiguous periods
  const suggestions: Array<{ start: string; end: string; days: number; avgScore: number; avgPercent: number; compositeScore: number }> = [];

  for (let winSize = Math.min(dates.length, minDays); winSize <= dates.length; winSize++) {
    for (let start = 0; start <= dates.length - winSize; start++) {
      const window = dates.slice(start, start + winSize);
      const total = window.reduce((s, d) => s + scoreFor(d), 0);
      const avgScore = total / winSize;
      const compositeScore = avgScore * Math.sqrt(winSize);
      suggestions.push({
        start: window[0],
        end: window[window.length - 1],
        days: winSize,
        avgScore: Math.round(avgScore * 100) / 100,
        avgPercent: Math.round((avgScore / Math.max(totalMembers, 1)) * 100),
        compositeScore: Math.round(compositeScore * 100) / 100,
      });
    }
  }

  // Sort by composite score descending, then deduplicate overlapping windows
  suggestions.sort((a, b) => b.compositeScore - a.compositeScore);

  const bestPeriods: typeof suggestions = [];
  for (const s of suggestions) {
    if (bestPeriods.length >= maxSuggestions) break;
    const overlaps = bestPeriods.some(b => s.start <= b.end && s.end >= b.start);
    if (!overlaps) bestPeriods.push(s);
  }

  res.json({ perDayOverlap, bestPeriods, statistics: { totalMembers, totalResponded, overallAvgScore: Math.round(overallAvgScore * 100) / 100 } });
});

// ── PATCH /groups/:groupId/date-proposals/:proposalId/confirm ─────────────────

router.patch('/:proposalId/confirm', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { groupId, proposalId } = req.params;
  const access = getGroupAccess(groupId, authReq.user.id);
  if (!access) return res.status(404).json({ error: 'Group not found' });

  const proposal = db.prepare('SELECT * FROM date_proposals WHERE id = ? AND group_id = ?').get(proposalId, groupId) as { created_by: number; period_start: string; period_end: string } | undefined;
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

  const isOwnerAdmin = access.role === 'owner' || access.role === 'admin';
  if (!isOwnerAdmin && proposal.created_by !== authReq.user.id) return res.status(403).json({ error: 'No permission' });

  const { confirmed_start, confirmed_end } = req.body as { confirmed_start: string; confirmed_end: string };
  if (!confirmed_start || !confirmed_end) return res.status(400).json({ error: 'confirmed_start and confirmed_end are required' });
  if (confirmed_start < proposal.period_start || confirmed_end > proposal.period_end) {
    return res.status(400).json({ error: 'Confirmed dates must be within the proposal period' });
  }
  if (confirmed_end < confirmed_start) return res.status(400).json({ error: 'confirmed_end must be after confirmed_start' });

  db.prepare(`UPDATE date_proposals SET confirmed_start = ?, confirmed_end = ?, status = 'confirmed' WHERE id = ?`).run(confirmed_start, confirmed_end, proposalId);

  const updated = db.prepare('SELECT * FROM date_proposals WHERE id = ?').get(proposalId) as Record<string, unknown>;
  res.json({ proposal: updated });
  broadcast(groupId, 'dateProposal:confirmed', { proposalId: Number(proposalId), confirmed_start, confirmed_end }, req.headers['x-socket-id'] as string);
});

// ── PATCH /groups/:groupId/date-proposals/:proposalId/reopen ──────────────────

router.patch('/:proposalId/reopen', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { groupId, proposalId } = req.params;
  const access = getGroupAccess(groupId, authReq.user.id);
  if (!access) return res.status(404).json({ error: 'Group not found' });

  const proposal = db.prepare('SELECT * FROM date_proposals WHERE id = ? AND group_id = ?').get(proposalId, groupId) as { created_by: number } | undefined;
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

  const isOwnerAdmin = access.role === 'owner' || access.role === 'admin';
  if (!isOwnerAdmin && proposal.created_by !== authReq.user.id) return res.status(403).json({ error: 'No permission' });

  db.prepare(`UPDATE date_proposals SET confirmed_start = NULL, confirmed_end = NULL, status = 'open' WHERE id = ?`).run(proposalId);

  res.json({ ok: true });
  broadcast(groupId, 'dateProposal:reopened', { proposalId: Number(proposalId) }, req.headers['x-socket-id'] as string);
});

// ── POST /groups/:groupId/date-proposals/:proposalId/guest-link ───────────────

router.post('/:proposalId/guest-link', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { groupId, proposalId } = req.params;
  const access = getGroupAccess(groupId, authReq.user.id);
  if (!access) return res.status(404).json({ error: 'Group not found' });

  const proposal = db.prepare('SELECT * FROM date_proposals WHERE id = ? AND group_id = ?').get(proposalId, groupId) as { id: number } | undefined;
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

  const isOwnerAdmin = access.role === 'owner' || access.role === 'admin';
  if (!isOwnerAdmin) return res.status(403).json({ error: 'Only admins can create guest links' });

  const { expires_in_days } = req.body as { expires_in_days?: number };
  const token = require('crypto').randomBytes(24).toString('hex');
  const expiresAt = expires_in_days ? new Date(Date.now() + expires_in_days * 86400000).toISOString() : null;

  const info = db.prepare(`
    INSERT INTO date_proposal_guest_tokens (proposal_id, token, created_by, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(proposalId, token, authReq.user.id, expiresAt);

  const row = db.prepare('SELECT * FROM date_proposal_guest_tokens WHERE id = ?').get(info.lastInsertRowid) as Record<string, unknown>;
  res.status(201).json({ guestToken: row, url: `/guest/availability/${token}` });
});

// ── DELETE /groups/:groupId/date-proposals/:proposalId/guest-link/:tokenId ────

router.delete('/:proposalId/guest-link/:tokenId', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { groupId, proposalId, tokenId } = req.params;
  const access = getGroupAccess(groupId, authReq.user.id);
  if (!access) return res.status(404).json({ error: 'Group not found' });

  const isOwnerAdmin = access.role === 'owner' || access.role === 'admin';
  if (!isOwnerAdmin) return res.status(403).json({ error: 'Only admins can delete guest links' });

  db.prepare('DELETE FROM date_proposal_guest_tokens WHERE id = ? AND proposal_id = ?').run(tokenId, proposalId);
  res.json({ ok: true });
});

export default router;

// ── GET /api/date-proposals/mine ──────────────────────────────────────────────

export const mineRouter = express.Router();

mineRouter.get('/', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.user.id;

  // All proposals from groups the user is a member of
  const proposals = db.prepare(`
    SELECT dp.id, dp.title, dp.group_id, g.name AS group_name,
           dp.period_start, dp.period_end
    FROM date_proposals dp
    JOIN groups g ON g.id = dp.group_id
    JOIN group_members gm ON gm.group_id = dp.group_id AND gm.user_id = ?
    ORDER BY dp.period_start ASC
  `).all(userId) as Array<{ id: number; title: string; group_id: number; group_name: string; period_start: string; period_end: string }>;

  res.json({ proposals });
});
