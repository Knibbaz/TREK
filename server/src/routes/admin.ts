import express, { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { authenticate, adminOnly } from '../middleware/auth';
import { AuthRequest } from '../types';
import { db } from '../db/database';
import { writeAudit, getClientIp, logInfo } from '../services/auditLog';
import * as svc from '../services/adminService';
import { getAdminUserDefaults, setAdminUserDefaults } from '../services/settingsService';
import { invalidateMcpSessions } from '../mcp';
import { getPreferencesMatrix, setAdminPreferences } from '../services/notificationPreferencesService';
import { sendWelcomeEmail } from '../services/notifications';

const router = express.Router();

router.use(authenticate, adminOnly);

// ── User CRUD ──────────────────────────────────────────────────────────────

router.get('/users', (_req: Request, res: Response) => {
  res.json({ users: svc.listUsers() });
});

// Get users with trip statistics
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

router.put('/users/:id', (req: Request, res: Response) => {
  const result = svc.updateUser(req.params.id, req.body);
  if ('error' in result) return res.status(result.status!).json({ error: result.error });
  const authReq = req as AuthRequest;
  writeAudit({
    userId: authReq.user.id,
    action: 'admin.user_update',
    resource: String(req.params.id),
    ip: getClientIp(req),
    details: { targetUser: result.previousEmail, fields: result.changed },
  });
  logInfo(`Admin ${authReq.user.email} edited user ${result.previousEmail} (fields: ${result.changed.join(', ')})`);
  res.json({ user: result.user });
});

router.delete('/users/:id', (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const result = svc.deleteUser(req.params.id, authReq.user.id);
  if ('error' in result) return res.status(result.status!).json({ error: result.error });
  writeAudit({
    userId: authReq.user.id,
    action: 'admin.user_delete',
    resource: String(req.params.id),
    ip: getClientIp(req),
    details: { targetUser: result.email },
  });
  logInfo(`Admin ${authReq.user.email} deleted user ${result.email}`);
  res.json({ success: true });
});

// ── Stats ──────────────────────────────────────────────────────────────────

router.get('/stats', (_req: Request, res: Response) => {
  res.json(svc.getStats());
});

// ── Permissions ────────────────────────────────────────────────────────────

router.get('/permissions', (_req: Request, res: Response) => {
  res.json(svc.getPermissions());
});

router.put('/permissions', (req: Request, res: Response) => {
  const { permissions } = req.body;
  if (!permissions || typeof permissions !== 'object') {
    return res.status(400).json({ error: 'permissions object required' });
  }
  const authReq = req as AuthRequest;
  const result = svc.savePermissions(permissions);
  writeAudit({
    userId: authReq.user.id,
    action: 'admin.permissions_update',
    resource: 'permissions',
    ip: getClientIp(req),
    details: permissions,
  });
  res.json({ success: true, permissions: result.permissions, ...(result.skipped.length ? { skipped: result.skipped } : {}) });
});

// ── Audit Log ──────────────────────────────────────────────────────────────

router.get('/audit-log', (req: Request, res: Response) => {
  res.json(svc.getAuditLog(req.query as { limit?: string; offset?: string }));
});

// ── OIDC Settings ──────────────────────────────────────────────────────────

router.get('/oidc', (_req: Request, res: Response) => {
  res.json(svc.getOidcSettings());
});

router.put('/oidc', (req: Request, res: Response) => {
  const result = svc.updateOidcSettings(req.body);
  if (result.error) {
    return res.status(result.status || 400).json({ error: result.error });
  }
  const authReq = req as AuthRequest;
  writeAudit({
    userId: authReq.user.id,
    action: 'admin.oidc_update',
    ip: getClientIp(req),
    details: { issuer_set: !!req.body.issuer },
  });
  res.json({ success: true });
});

// ── Demo Baseline ──────────────────────────────────────────────────────────

router.post('/save-demo-baseline', (req: Request, res: Response) => {
  const result = svc.saveDemoBaseline();
  if (result.error) return res.status(result.status!).json({ error: result.error });
  const authReq = req as AuthRequest;
  writeAudit({ userId: authReq.user.id, action: 'admin.demo_baseline_save', ip: getClientIp(req) });
  res.json({ success: true, message: result.message });
});

// ── GitHub / Version ───────────────────────────────────────────────────────

router.get('/github-releases', async (req: Request, res: Response) => {
  const { per_page = '10', page = '1' } = req.query;
  res.json(await svc.getGithubReleases(String(per_page), String(page)));
});

router.get('/version-check', async (_req: Request, res: Response) => {
  res.json(await svc.checkVersion());
});

// ── Admin notification preferences ────────────────────────────────────────

router.get('/notification-preferences', (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  res.json(getPreferencesMatrix(authReq.user.id, authReq.user.role, 'admin'));
});

router.put('/notification-preferences', (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  setAdminPreferences(authReq.user.id, req.body);
  res.json(getPreferencesMatrix(authReq.user.id, authReq.user.role, 'admin'));
});

// ── Invite Tokens ──────────────────────────────────────────────────────────

router.get('/invites', (_req: Request, res: Response) => {
  res.json({ invites: svc.listInvites() });
});

router.post('/invites', (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const result = svc.createInvite(authReq.user.id, req.body);
  writeAudit({
    userId: authReq.user.id,
    action: 'admin.invite_create',
    resource: String(result.inviteId),
    ip: getClientIp(req),
    details: { max_uses: result.uses, expires_in_days: result.expiresInDays },
  });
  res.status(201).json({ invite: result.invite });
});

router.delete('/invites/:id', (req: Request, res: Response) => {
  const result = svc.deleteInvite(req.params.id);
  if ('error' in result) return res.status(result.status!).json({ error: result.error });
  const authReq = req as AuthRequest;
  writeAudit({
    userId: authReq.user.id,
    action: 'admin.invite_delete',
    resource: String(req.params.id),
    ip: getClientIp(req),
  });
  res.json({ success: true });
});

// ── Bag Tracking ───────────────────────────────────────────────────────────

router.get('/bag-tracking', (_req: Request, res: Response) => {
  res.json(svc.getBagTracking());
});

router.put('/bag-tracking', (req: Request, res: Response) => {
  const result = svc.updateBagTracking(req.body.enabled);
  const authReq = req as AuthRequest;
  writeAudit({
    userId: authReq.user.id,
    action: 'admin.bag_tracking',
    ip: getClientIp(req),
    details: { enabled: result.enabled },
  });
  res.json(result);
});

// ── Places Photos ───────────────────────────────────────────────────────

router.get('/places-photos', (_req: Request, res: Response) => {
  res.json(svc.getPlacesPhotos());
});

router.put('/places-photos', (req: Request, res: Response) => {
  if (typeof req.body.enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' });
  const result = svc.updatePlacesPhotos(req.body.enabled);
  const authReq = req as AuthRequest;
  writeAudit({
    userId: authReq.user.id,
    action: 'admin.places_photos',
    ip: getClientIp(req),
    details: { enabled: result.enabled },
  });
  res.json(result);
});

// ── Places Autocomplete ──────────────────────────────────────────────────

router.get('/places-autocomplete', (_req: Request, res: Response) => {
  res.json(svc.getPlacesAutocomplete());
});

router.put('/places-autocomplete', (req: Request, res: Response) => {
  if (typeof req.body.enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' });
  const result = svc.updatePlacesAutocomplete(req.body.enabled);
  const authReq = req as AuthRequest;
  writeAudit({
    userId: authReq.user.id,
    action: 'admin.places_autocomplete',
    ip: getClientIp(req),
    details: { enabled: result.enabled },
  });
  res.json(result);
});

// ── Places Details ───────────────────────────────────────────────────────

router.get('/places-details', (_req: Request, res: Response) => {
  res.json(svc.getPlacesDetails());
});

router.put('/places-details', (req: Request, res: Response) => {
  if (typeof req.body.enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' });
  const result = svc.updatePlacesDetails(req.body.enabled);
  const authReq = req as AuthRequest;
  writeAudit({
    userId: authReq.user.id,
    action: 'admin.places_details',
    ip: getClientIp(req),
    details: { enabled: result.enabled },
  });
  res.json(result);
});

// ── Collab Features ───────────────────────────────────────────────────────

router.get('/collab-features', (_req: Request, res: Response) => {
  res.json(svc.getCollabFeatures());
});

router.put('/collab-features', (req: Request, res: Response) => {
  const result = svc.updateCollabFeatures(req.body);
  invalidateMcpSessions();
  const authReq = req as AuthRequest;
  writeAudit({
    userId: authReq.user.id,
    action: 'admin.collab_features',
    ip: getClientIp(req),
    details: result,
  });
  res.json(result);
});

// ── Unsplash API key ──────────────────────────────────────────────────────

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

// ── Group welcome notice ───────────────────────────────────────────────────

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

// ── Packing Templates ──────────────────────────────────────────────────────

router.get('/packing-templates', (_req: Request, res: Response) => {
  res.json({ templates: svc.listPackingTemplates() });
});

router.get('/packing-templates/:id', (req: Request, res: Response) => {
  const result = svc.getPackingTemplate(req.params.id);
  if ('error' in result) return res.status(result.status!).json({ error: result.error });
  res.json(result);
});

router.post('/packing-templates', (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const result = svc.createPackingTemplate(req.body.name, authReq.user.id);
  if ('error' in result) return res.status(result.status!).json({ error: result.error });
  res.status(201).json(result);
});

router.put('/packing-templates/:id', (req: Request, res: Response) => {
  const result = svc.updatePackingTemplate(req.params.id, req.body);
  if ('error' in result) return res.status(result.status!).json({ error: result.error });
  res.json(result);
});

router.delete('/packing-templates/:id', (req: Request, res: Response) => {
  const result = svc.deletePackingTemplate(req.params.id);
  if ('error' in result) return res.status(result.status!).json({ error: result.error });
  const authReq = req as AuthRequest;
  writeAudit({
    userId: authReq.user.id,
    action: 'admin.packing_template_delete',
    resource: String(req.params.id),
    ip: getClientIp(req),
    details: { name: result.name },
  });
  res.json({ success: true });
});

// Template categories

router.post('/packing-templates/:id/categories', (req: Request, res: Response) => {
  const result = svc.createTemplateCategory(req.params.id, req.body.name);
  if ('error' in result) return res.status(result.status!).json({ error: result.error });
  res.status(201).json(result);
});

router.put('/packing-templates/:templateId/categories/:catId', (req: Request, res: Response) => {
  const result = svc.updateTemplateCategory(req.params.templateId, req.params.catId, req.body);
  if ('error' in result) return res.status(result.status!).json({ error: result.error });
  res.json(result);
});

router.delete('/packing-templates/:templateId/categories/:catId', (req: Request, res: Response) => {
  const result = svc.deleteTemplateCategory(req.params.templateId, req.params.catId);
  if ('error' in result) return res.status(result.status!).json({ error: result.error });
  res.json({ success: true });
});

// Template items

router.post('/packing-templates/:templateId/categories/:catId/items', (req: Request, res: Response) => {
  const result = svc.createTemplateItem(req.params.templateId, req.params.catId, req.body.name);
  if ('error' in result) return res.status(result.status!).json({ error: result.error });
  res.status(201).json(result);
});

router.put('/packing-templates/:templateId/items/:itemId', (req: Request, res: Response) => {
  const result = svc.updateTemplateItem(req.params.itemId, req.body);
  if ('error' in result) return res.status(result.status!).json({ error: result.error });
  res.json(result);
});

router.delete('/packing-templates/:templateId/items/:itemId', (req: Request, res: Response) => {
  const result = svc.deleteTemplateItem(req.params.itemId);
  if ('error' in result) return res.status(result.status!).json({ error: result.error });
  res.json({ success: true });
});

// ── Addons ─────────────────────────────────────────────────────────────────

router.get('/addons', (_req: Request, res: Response) => {
  res.json({ addons: svc.listAddons() });
});

router.put('/addons/:id', (req: Request, res: Response) => {
  const result = svc.updateAddon(req.params.id, req.body);
  if ('error' in result) return res.status(result.status!).json({ error: result.error });
  const authReq = req as AuthRequest;
  writeAudit({
    userId: authReq.user.id,
    action: 'admin.addon_update',
    resource: String(req.params.id),
    ip: getClientIp(req),
    details: result.auditDetails,
  });
  // Invalidate all MCP sessions so they re-create with the updated addon tool set
  invalidateMcpSessions();
  res.json({ addon: result.addon });
});

// ── MCP Tokens ─────────────────────────────────────────────────────────────

router.get('/mcp-tokens', (_req: Request, res: Response) => {
  res.json({ tokens: svc.listMcpTokens() });
});

router.delete('/mcp-tokens/:id', (req: Request, res: Response) => {
  const result = svc.deleteMcpToken(req.params.id);
  if ('error' in result) return res.status(result.status!).json({ error: result.error });
  res.json({ success: true });
});

// ── OAuth Sessions ─────────────────────────────────────────────────────────

router.get('/oauth-sessions', (_req: Request, res: Response) => {
  res.json({ sessions: svc.listOAuthSessions() });
});

router.delete('/oauth-sessions/:id', (req: Request, res: Response) => {
  const result = svc.revokeOAuthSession(req.params.id);
  if ('error' in result) return res.status(result.status!).json({ error: result.error });
  const authReq = req as AuthRequest;
  writeAudit({
    userId: authReq.user.id,
    action: 'admin.oauth_session.revoke',
    resource: String(req.params.id),
    ip: getClientIp(req),
  });
  res.json({ success: true });
});

// ── JWT Rotation ───────────────────────────────────────────────────────────

router.post('/rotate-jwt-secret', (req: Request, res: Response) => {
  const result = svc.rotateJwtSecret();
  if (result.error) return res.status(result.status!).json({ error: result.error });
  const authReq = req as AuthRequest;
  writeAudit({
    userId: authReq.user.id,
    action: 'admin.rotate_jwt_secret',
    ip: getClientIp(req),
  });
  res.json({ success: true });
});

// ── Default User Settings ──────────────────────────────────────────────────────

router.get('/default-user-settings', (_req: Request, res: Response) => {
  res.json(getAdminUserDefaults());
});

router.put('/default-user-settings', (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Object body required' });
  }
  try {
    setAdminUserDefaults(req.body);
    const authReq = req as AuthRequest;
    writeAudit({
      userId: authReq.user.id,
      action: 'admin.default_user_settings_update',
      ip: getClientIp(req),
      details: req.body,
    });
    res.json(getAdminUserDefaults());
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── Creator payouts ──────────────────────────────────────────────────────────
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

// ── Platform fee settings ───────────────────────────────────────────────────
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

// ── Mollie payment method fees ──────────────────────────────────────────────
const DEFAULT_MOLLIE_METHODS = [
  { name: 'iDEAL', fixed_cents: 29, variable_pct: 1.8 },
  { name: 'Credit card', fixed_cents: 29, variable_pct: 2.34 },
];

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

// ── Creator profile management ──────────────────────────────────────────────

// List pending creator applications
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

// Approve creator application
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

// Reject creator application
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

// Toggle featured status for listings
router.patch('/explore/listings/:id/featured', (req: Request, res: Response) => {
  try {
    const listingId = parseInt(req.params.id, 10);
    const { is_featured } = req.body;

    if (is_featured === undefined || is_featured === null) {
      return res.status(400).json({ error: 'is_featured is required' });
    }

    const listing = db.prepare('SELECT * FROM explore_published WHERE id = ?').get(listingId) as any;
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Toggle featured status
    db.prepare(`
      UPDATE explore_published
      SET is_featured = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(is_featured ? 1 : 0, listingId);

    res.json({ success: true, is_featured: !!is_featured });
  } catch (err: unknown) {
    console.error('Error toggling featured status:', err);
    res.status(500).json({ error: 'Failed to toggle featured status' });
  }
});

// ── Dev-only: test notification endpoints ──────────────────────────────────────
if (process.env.NODE_ENV?.toLowerCase() === 'development') {
  const { send } = require('../services/notificationService');

  router.post('/dev/test-notification', async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { event = 'trip_reminder', scope = 'user', targetId, params = {}, inApp } = req.body;

    try {
      await send({
        event,
        actorId: authReq.user.id,
        scope,
        targetId: targetId ?? authReq.user.id,
        params: { actor: authReq.user.email, ...params },
        inApp,
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });
}

export default router;
