import type { Express, Request, Response, NextFunction } from 'express';
import groupsRoutes from './groups';
import dateProposalsRoutes, { mineRouter as dateProposalsMineRouter } from './dateProposals';
import availabilityRoutes from './availability';
import guestAvailabilityRoutes from './guestAvailability';
import visitorInsightsRoutes from './visitorInsights';
import exploreRoutes from './explore';
import explorePaymentsRoutes from './payments';
import creatorHubLibRoutes, { publicLibRouter } from './creator-hub/link-in-bio';
import creatorHubAffiliatesRoutes, { publicAffiliateRouter } from './creator-hub/affiliates';
import creatorHubTipsRoutes from './creator-hub/tips';
import mollieConnectRoutes from './mollieConnect';
import mollieWebhookRoutes from './mollieWebhook';
import worldmapRoutes from './worldmap';
import adminImportRouter from './backup/admin-import';
import schedulesRouter from './backup/schedules';
import userExportRouter from './backup/user-export';
import userGdprRouter from './user-gdpr';
import adminGdprRouter from './admin-gdpr';

/**
 * Mounts the ROUTD-fork feature routers (Express) on the underlying Express
 * instance BEFORE Nest's `app.init()`, mirroring how the platform routes are
 * registered in bootstrap.ts. Each router only matches its own paths and
 * `next()`s everything else through to the Nest controllers, so the upstream
 * /api domains are untouched.
 *
 * These routers predate the NestJS migration; they are bridged as-is and can
 * be converted into Nest modules one by one later.
 */
export function applyLegacyFeatureRoutes(app: Express): void {
  // Allow /shared/* pages to be embedded in iframes (e.g. travel blogs)
  const allowFraming = (_req: Request, res: Response, next: NextFunction) => {
    res.removeHeader('X-Frame-Options');
    const csp = res.getHeader('Content-Security-Policy') as string | undefined;
    if (csp) {
      res.setHeader('Content-Security-Policy', csp.replace(/frame-ancestors [^;]+/, 'frame-ancestors *'));
    }
    next();
  };
  app.use('/shared', allowFraming);
  app.use('/api/shared', allowFraming);

  app.use('/api/groups/:groupId/date-proposals', dateProposalsRoutes);
  app.use('/api/date-proposals', dateProposalsMineRouter);
  app.use('/api/availability', availabilityRoutes);
  app.use('/api/guest/availability', guestAvailabilityRoutes);
  app.use('/api/visits', visitorInsightsRoutes);
  app.use('/api/addons/groups', groupsRoutes);
  app.use('/api/addons/explore', exploreRoutes);
  app.use('/api/addons/explore/payments', explorePaymentsRoutes);
  app.use('/api/addons/explore/creator-hub/lib', creatorHubLibRoutes);
  app.use('/api/public/lib', publicLibRouter);
  app.use('/api/addons/explore/creator-hub/affiliates', creatorHubAffiliatesRoutes);
  app.use('/api/public/go', publicAffiliateRouter);
  app.use('/api/addons/explore/creator-hub/tips', creatorHubTipsRoutes);
  app.use('/api/mollie', mollieConnectRoutes);
  app.use('/webhooks/mollie', mollieWebhookRoutes);
  app.use('/api/addons/worldmap', worldmapRoutes);
  app.use('/api/admin/backup-v2', adminImportRouter);
  app.use('/api/admin/backup-v2', schedulesRouter);
  app.use('/api/user', userExportRouter);
  app.use('/api/user', userGdprRouter);
  app.use('/api/admin/gdpr', adminGdprRouter);
}
