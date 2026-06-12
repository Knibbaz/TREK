import express, { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { authenticate, adminOnly } from '../../middleware/auth';
import { AuthRequest } from '../../types';
import { db } from '../../db/database';
import { writeAudit, getClientIp, logInfo } from '../../services/auditLog';
import * as svc from '../../services/adminService';
import { getAdminUserDefaults, setAdminUserDefaults } from '../../services/settingsService';
import { invalidateMcpSessions } from '../../mcp';
import { getPreferencesMatrix, setAdminPreferences } from '../../services/notificationPreferencesService';
import { sendWelcomeEmail } from '../../services/notifications';

const router = express.Router();

const DEFAULT_MOLLIE_METHODS = [
  { name: 'iDEAL', fixed_cents: 29, variable_pct: 1.8 },
  { name: 'Credit card', fixed_cents: 29, variable_pct: 2.34 },
];

const BRANDING_KEYS = ['brand_name', 'brand_logo_light', 'brand_logo_dark', 'brand_icon_light', 'brand_icon_dark', 'brand_accent', 'brand_accent_text', 'brand_bg_primary', 'brand_bg_secondary', 'brand_text_primary', 'brand_text_secondary', 'brand_text_muted', 'brand_nav_bg', 'disable_dark_mode'] as const;

const brandingDir = path.join(__dirname, '../../../uploads/branding');
if (!fs.existsSync(brandingDir)) fs.mkdirSync(brandingDir, { recursive: true });

const brandingStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, brandingDir),
  filename: (_req, file, cb) => cb(null, uuid() + path.extname(file.originalname).toLowerCase()),
});
const ALLOWED_BRANDING_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
const brandingUpload = multer({
  storage: brandingStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_BRANDING_EXTS.includes(ext)) {
      const err: Error & { statusCode?: number } = new Error('Only image files (jpg, png, gif, webp, svg) are allowed');
      err.statusCode = 400;
      return cb(err);
    }
    cb(null, true);
  },
});


router.use(authenticate, adminOnly);

// ── User CRUD ──────────────────────────────────────────────────────────────

router.get('/users/stats/trips', (_req: Request, res: Response) => {
  res.json({ users: svc.getUsersWithTripStats() });
});

router.post('/users', async (req: Request, res: Response) => {
  const { send_welcome_email, ...bodyRest } = req.body;
  const sendWelcome = !!send_welcome_email;

  // Auto-generate password when welcome email is requested
  let generatedPassword: string | undefined;
  if (sendWelcome) {
    generatedPassword = randomBytes(12).toString('base64url').slice(0, 16);
    bodyRest.password = generatedPassword;
    bodyRest.must_change_password = true;
  }

  const result = svc.createUser(bodyRest);
  if ('error' in result) return res.status(result.status!).json({ error: result.error });

  const authReq = req as AuthRequest;
  writeAudit({
    userId: authReq.user.id,
    action: 'admin.user_create',
    resource: String(result.insertedId),
    ip: getClientIp(req),
    details: result.auditDetails,
  });

  if (sendWelcome && generatedPassword) {
    await sendWelcomeEmail(bodyRest.email.trim(), bodyRest.username.trim(), generatedPassword);
  }

  res.status(201).json({ user: result.user, welcome_email_sent: sendWelcome });
});

router.get('/unsplash', (_req: Request, res: Response) => {
  res.json(svc.getUnsplashApiKey());
});

router.put('/unsplash', (req: Request, res: Response) => {
  const { key } = req.body as { key?: string };
  const result = svc.setUnsplashApiKey(key ?? '');
  const authReq = req as AuthRequest;
  writeAudit({ userId: authReq.user.id, action: 'admin.unsplash_api_key', ip: getClientIp(req), details: { configured: result.configured } });
  res.json(result);
});

router.get('/group-welcome-notice', (_req: Request, res: Response) => {
  res.json(svc.getGroupWelcomeNotice());
});

router.put('/group-welcome-notice', (req: Request, res: Response) => {
  const { title, body, icon } = req.body as { title?: string; body?: string; icon?: string };
  const result = svc.setGroupWelcomeNotice({ title, body, icon });
  const authReq = req as AuthRequest;
  writeAudit({
    userId: authReq.user.id,
    action: 'admin.group_welcome_notice',
    ip: getClientIp(req),
    details: { title, body, icon },
  });
  res.json(result);
});

router.get('/payouts', (_req: Request, res: Response) => {
  try {
    const creators = db.prepare(`
      SELECT u.id, u.username, u.email,
        COALESCE(SUM(ep.creator_payout_cents), 0) as total_earned,
        COALESCE(SUM(CASE WHEN ep.status = 'paid' THEN ep.creator_payout_cents ELSE 0 END), 0) as total_paid,
        COUNT(CASE WHEN ep.status = 'paid' THEN 1 END) as sales_count
      FROM users u
      LEFT JOIN explore_payments ep ON ep.creator_user_id = u.id
      WHERE u.role = 'creator'
      GROUP BY u.id
      ORDER BY total_earned DESC
    `).all() as Array<{
      id: number; username: string; email: string;
      total_earned: number; total_paid: number; sales_count: number;
    }>;

    const payouts = db.prepare(`
      SELECT cp.*, u.username as creator_name
      FROM creator_payouts cp
      JOIN users u ON u.id = cp.creator_user_id
      ORDER BY cp.created_at DESC
    `).all();

    res.json({ creators, payouts });
  } catch (err: any) {
    console.error('Error fetching payouts:', err);
    res.status(500).json({ error: 'Failed to fetch payouts' });
  }
});

router.post('/payouts', (req: Request, res: Response) => {
  try {
    const { creator_user_id, amount_cents, description } = req.body;
    if (!creator_user_id || !amount_cents) {
      return res.status(400).json({ error: 'creator_user_id and amount_cents are required' });
    }

    const result = db.prepare(`
      INSERT INTO creator_payouts (creator_user_id, amount_cents, description, status, paid_at)
      VALUES (?, ?, ?, 'paid', datetime('now'))
    `).run(creator_user_id, amount_cents, description || null);

    const payout = db.prepare('SELECT * FROM creator_payouts WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ payout });
  } catch (err: any) {
    console.error('Error creating payout:', err);
    res.status(500).json({ error: 'Failed to create payout' });
  }
});

router.get('/platform-fee', (_req: Request, res: Response) => {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'platform_fee_percent'").get() as { value: string } | undefined;
    const fee = row ? parseInt(row.value, 10) : null;
    res.json({ platform_fee_percent: fee });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch platform fee' });
  }
});

router.put('/platform-fee', (req: Request, res: Response) => {
  try {
    const { platform_fee_percent } = req.body;
    if (platform_fee_percent === undefined || platform_fee_percent === null) {
      db.prepare("DELETE FROM app_settings WHERE key = 'platform_fee_percent'").run();
      return res.json({ platform_fee_percent: null });
    }
    const fee = parseInt(platform_fee_percent, 10);
    if (isNaN(fee) || fee < 0 || fee > 100) {
      return res.status(400).json({ error: 'Fee must be between 0 and 100' });
    }
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('platform_fee_percent', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(fee));
    res.json({ platform_fee_percent: fee });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update platform fee' });
  }
});

router.get('/mollie-fees', (req: Request, res: Response) => {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'mollie_payment_methods'").get() as { value: string } | undefined;
    const methods = row ? JSON.parse(row.value) : DEFAULT_MOLLIE_METHODS;
    res.json({ methods });
  } catch (err: any) {
    console.error('Error fetching mollie fees:', err);
    res.status(500).json({ error: 'Failed to fetch mollie fees' });
  }
});

router.put('/mollie-fees', (req: Request, res: Response) => {
  try {
    const { methods } = req.body;
    if (!Array.isArray(methods)) {
      return res.status(400).json({ error: 'methods must be array' });
    }
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('mollie_payment_methods', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(JSON.stringify(methods));
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error updating mollie fees:', err);
    res.status(500).json({ error: 'Failed to update mollie fees' });
  }
});

router.patch('/trips/:tripId/owner', (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { tripId } = req.params;
    const { new_user_id } = req.body;

    if (!new_user_id) {
      return res.status(400).json({ error: 'new_user_id is required' });
    }

    // Validate trip exists
    const trip = db.prepare('SELECT id, user_id, title FROM trips WHERE id = ?').get(tripId) as { id: number; user_id: number; title: string } | undefined;
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Validate new owner exists
    const newOwner = db.prepare('SELECT id FROM users WHERE id = ?').get(new_user_id) as { id: number } | undefined;
    if (!newOwner) {
      return res.status(404).json({ error: 'User not found' });
    }

    // No-op if transferring to same user
    if (trip.user_id === new_user_id) {
      return res.json({ success: true, message: 'Trip already owned by this user' });
    }

    // Remove new owner from trip_members if they were a collaborator (avoid unique constraint violation)
    db.prepare('DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?').run(tripId, new_user_id);

    // Update trip owner
    db.prepare('UPDATE trips SET user_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(new_user_id, tripId);

    // Write audit log
    writeAudit({
      userId: authReq.user.id,
      action: 'admin.trip_transfer',
      resource: String(tripId),
      ip: getClientIp(req),
      details: { trip_title: trip.title, from_user_id: trip.user_id, to_user_id: new_user_id },
    });

    res.json({ success: true, message: `Trip transferred to new owner` });
  } catch (err: unknown) {
    console.error('Error transferring trip:', err);
    res.status(500).json({ error: 'Failed to transfer trip' });
  }
});

router.get('/explore/creators', (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || 'pending';
    const creators = db.prepare(`
      SELECT
        ec.*,
        u.username, u.email, u.created_at as user_created_at,
        COUNT(ep.id) as listing_count
      FROM explore_creators ec
      JOIN users u ON u.id = ec.user_id
      LEFT JOIN trips t ON t.user_id = ec.user_id
      LEFT JOIN explore_published ep ON ep.trip_id = t.id AND ep.is_published = 1
      WHERE ec.status = ?
      GROUP BY ec.id
      ORDER BY ec.created_at DESC
    `).all(status) as any[];

    res.json({ creators });
  } catch (err: unknown) {
    console.error('Error fetching creator applications:', err);
    res.status(500).json({ error: 'Failed to fetch creator applications' });
  }
});

router.patch('/explore/creators/:id/approve', (req: Request, res: Response) => {
  try {
    const creatorId = parseInt(req.params.id, 10);
    const { notes } = req.body;

    const creator = db.prepare('SELECT * FROM explore_creators WHERE id = ?').get(creatorId) as any;
    if (!creator) {
      return res.status(404).json({ error: 'Creator not found' });
    }

    // Update creator status
    db.prepare(`
      UPDATE explore_creators
      SET status = 'approved', updated_at = datetime('now')
      WHERE id = ?
    `).run(creatorId);

    // Send notification to user
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, created_at, is_read)
      VALUES (?, 'creator_approved', 'Creator Profile Approved', ?, datetime('now'), 0)
    `).run(creator.user_id, notes ? `Your creator profile has been approved. ${notes}` : 'Your creator profile has been approved!');

    res.json({ success: true });
  } catch (err: unknown) {
    console.error('Error approving creator:', err);
    res.status(500).json({ error: 'Failed to approve creator' });
  }
});

router.patch('/explore/creators/:id/reject', (req: Request, res: Response) => {
  try {
    const creatorId = parseInt(req.params.id, 10);
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'rejection_reason is required' });
    }

    const creator = db.prepare('SELECT * FROM explore_creators WHERE id = ?').get(creatorId) as any;
    if (!creator) {
      return res.status(404).json({ error: 'Creator not found' });
    }

    // Update creator status
    db.prepare(`
      UPDATE explore_creators
      SET status = 'rejected', rejection_reason = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(reason, creatorId);

    // Send notification to user
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, created_at, is_read)
      VALUES (?, 'creator_rejected', 'Creator Application Rejected', ?, datetime('now'), 0)
    `).run(creator.user_id, `Your creator application was rejected: ${reason}`);

    res.json({ success: true });
  } catch (err: unknown) {
    console.error('Error rejecting creator:', err);
    res.status(500).json({ error: 'Failed to reject creator' });
  }
});

router.get('/branding', (_req: Request, res: Response) => {
  try {
    const result: Record<string, string> = {};
    for (const key of BRANDING_KEYS) {
      const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
      result[key] = row?.value ?? '';
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch branding' });
  }
});

router.put('/branding', (req: Request, res: Response) => {
  try {
    const allowed = ['brand_name', 'brand_accent', 'brand_accent_text', 'brand_bg_primary', 'brand_bg_secondary', 'brand_text_primary', 'brand_text_secondary', 'brand_text_muted', 'brand_nav_bg', 'disable_dark_mode'];
    for (const key of allowed) {
      if (key in req.body) {
        const value = String(req.body[key] ?? '');
        db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
      }
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update branding' });
  }
});

router.post('/branding/logo', brandingUpload.single('file'), (req: Request, res: Response) => {
  try {
    const { key } = req.body;
    const logoKeys = ['brand_logo_light', 'brand_logo_dark', 'brand_icon_light', 'brand_icon_dark'];
    if (!logoKeys.includes(key)) {
      return res.status(400).json({ error: 'Invalid key. Must be one of: ' + logoKeys.join(', ') });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    // Delete old file if it was a custom upload
    const existing = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
    if (existing?.value?.startsWith('/uploads/branding/')) {
      const oldPath = path.join(__dirname, '../..', existing.value);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    const url = `/uploads/branding/${req.file.filename}`;
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, url);
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});


export default router;
