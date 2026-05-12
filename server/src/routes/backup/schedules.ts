import express, { Request, Response } from 'express';
import { authenticate, adminOnly } from '../../middleware/auth';
import { writeAudit, getClientIp } from '../../services/auditLog';
import { db } from '../../db/database';
import { AuthRequest } from '../../types';
import { runExport } from '../../services/backup-v2/exporter';

const router = express.Router();

router.use(authenticate, adminOnly);

// GET /api/admin/backup-v2/schedules
router.get('/schedules', (req: Request, res: Response) => {
  try {
    const schedules = db.prepare(`
      SELECT id, name, cron_expression, timezone, is_enabled, scope, include_uploads,
             retention_days, max_backups, last_run_at, last_status, next_run_at,
             created_by, created_at, updated_at
      FROM backup_schedules
      ORDER BY created_at DESC
    `).all() as Array<Record<string, unknown>>;

    res.json({ success: true, schedules });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to fetch schedules', detail: msg });
  }
});

// POST /api/admin/backup-v2/schedules
router.post('/schedules', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { name, cron_expression, timezone, scope, include_uploads, retention_days, max_backups } = req.body;

    if (!name || !cron_expression || !scope) {
      return res.status(400).json({ error: 'Missing required fields: name, cron_expression, scope' });
    }

    const id = db.prepare(`
      INSERT INTO backup_schedules (name, cron_expression, timezone, scope, include_uploads, retention_days, max_backups, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `).get(
      name,
      cron_expression,
      timezone || 'Europe/Amsterdam',
      JSON.stringify(scope),
      include_uploads ? 1 : 0,
      retention_days || 30,
      max_backups || 10,
      authReq.user.id
    ) as { id: string };

    writeAudit({
      userId: authReq.user.id,
      action: 'backup.schedule_create',
      resource: id.id,
      ip: getClientIp(req),
      details: { name, cron_expression },
    });

    res.json({ success: true, id: id.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to create schedule', detail: msg });
  }
});

// PUT /api/admin/backup-v2/schedules/:id
router.put('/schedules/:id', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const { name, cron_expression, timezone, is_enabled, scope, include_uploads, retention_days, max_backups } = req.body;

    // Check if schedule exists
    const existing = db.prepare('SELECT id FROM backup_schedules WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (cron_expression !== undefined) {
      updates.push('cron_expression = ?');
      values.push(cron_expression);
    }
    if (timezone !== undefined) {
      updates.push('timezone = ?');
      values.push(timezone);
    }
    if (is_enabled !== undefined) {
      updates.push('is_enabled = ?');
      values.push(is_enabled ? 1 : 0);
    }
    if (scope !== undefined) {
      updates.push('scope = ?');
      values.push(JSON.stringify(scope));
    }
    if (include_uploads !== undefined) {
      updates.push('include_uploads = ?');
      values.push(include_uploads ? 1 : 0);
    }
    if (retention_days !== undefined) {
      updates.push('retention_days = ?');
      values.push(retention_days);
    }
    if (max_backups !== undefined) {
      updates.push('max_backups = ?');
      values.push(max_backups);
    }

    updates.push('updated_at = datetime("now")');
    values.push(id);

    db.prepare(`UPDATE backup_schedules SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    writeAudit({
      userId: authReq.user.id,
      action: 'backup.schedule_update',
      resource: id,
      ip: getClientIp(req),
      details: { updated: updates.length },
    });

    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to update schedule', detail: msg });
  }
});

// DELETE /api/admin/backup-v2/schedules/:id
router.delete('/schedules/:id', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;

    const existing = db.prepare('SELECT id FROM backup_schedules WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    db.prepare('DELETE FROM backup_schedules WHERE id = ?').run(id);

    writeAudit({
      userId: authReq.user.id,
      action: 'backup.schedule_delete',
      resource: id,
      ip: getClientIp(req),
    });

    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to delete schedule', detail: msg });
  }
});

// POST /api/admin/backup-v2/schedules/:id/run — trigger manual run
router.post('/schedules/:id/run', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;

    const schedule = db.prepare(`
      SELECT id, scope, include_uploads FROM backup_schedules WHERE id = ?
    `).get(id) as { id: string; scope: string; include_uploads: number } | undefined;

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const scopeObj = JSON.parse(schedule.scope);
    scopeObj.uploads = schedule.include_uploads === 1;

    // Run export
    const result = await runExport({
      id: `schedule-${schedule.id}-${Date.now()}`,
      exportType: 'scheduled',
      scope: scopeObj,
      initiatedBy: authReq.user.id,
      userRole: authReq.user.role,
    });

    // Update schedule with run info
    const nextRunAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // naive: assume daily
    db.prepare(`
      UPDATE backup_schedules
      SET last_run_at = datetime('now'), last_status = 'success', next_run_at = ?
      WHERE id = ?
    `).run(nextRunAt, schedule.id);

    writeAudit({
      userId: authReq.user.id,
      action: 'backup.schedule_run',
      resource: schedule.id,
      ip: getClientIp(req),
      details: { fileSize: result.fileSize },
    });

    res.json({ success: true, fileSize: result.fileSize, fileName: result.fileName });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to run schedule', detail: msg });
  }
});

export default router;
