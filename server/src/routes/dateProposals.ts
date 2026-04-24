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
    SELECT u.id, u.username, u.avatar_url
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

  // Fetch company holidays for the current + next year
  const currentYear = new Date().getFullYear();
  const companyHolidays = db.prepare(
    'SELECT id, date, name, color FROM company_holidays WHERE date >= ? AND date <= ? ORDER BY date'
  ).all(`${currentYear}-01-01`, `${currentYear + 1}-12-31`) as Array<{ id: number; date: string; name: string; color: string }>;

  const result = proposals.map(p => {
    const proposalStart = p.period_start as string;
    const proposalEnd = p.period_end as string;

    const availability = db.prepare(`
      SELECT da.user_id, da.date, da.status, u.username
      FROM date_availability da JOIN users u ON u.id = da.user_id
      WHERE da.proposal_id = ?
    `).all(p.id) as Array<{ user_id: number; date: string; status: string; username: string }>;

    // Filter vacation days overlapping this proposal
    const overlappingVacation = vacationDays.filter(v =>
      v.start_date <= proposalEnd && v.end_date >= proposalStart
    );

    // Filter company holidays within proposal range
    const overlappingCompany = companyHolidays.filter(h =>
      h.date >= proposalStart && h.date <= proposalEnd
    );

    return {
      ...p,
      availability,
      members,
      memberRegions,
      vacationDays: overlappingVacation,
      companyHolidays: overlappingCompany,
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

  const proposal = db.prepare('SELECT * FROM date_proposals WHERE id = ? AND group_id = ?').get(proposalId, groupId) as { period_start: string; period_end: string } | undefined;
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

  const { responses } = req.body as { responses: Record<string, 'yes' | 'no' | 'maybe' | null> };
  if (!responses || typeof responses !== 'object') return res.status(400).json({ error: 'responses object required' });

  const start = new Date(proposal.period_start);
  const end = new Date(proposal.period_end);
  const VALID = new Set(['yes', 'no', 'maybe']);

  const upsert = db.prepare(`
    INSERT INTO date_availability (proposal_id, user_id, date, status)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(proposal_id, user_id, date) DO UPDATE SET status = excluded.status
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
  })();

  const availability = db.prepare(`
    SELECT da.user_id, da.date, da.status, u.username
    FROM date_availability da JOIN users u ON u.id = da.user_id
    WHERE da.proposal_id = ?
  `).all(proposalId) as Array<{ user_id: number; date: string; status: string; username: string }>;

  res.json({ availability });
  broadcast(groupId, 'dateProposal:availabilityUpdated', {
    proposalId: Number(proposalId),
    userId: authReq.user.id,
    availability,
  }, req.headers['x-socket-id'] as string);
});

export default router;
