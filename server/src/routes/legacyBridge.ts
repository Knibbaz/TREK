import express from 'express';
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
import shareExtrasRoutes from './forkExtras/shareExtras';
import placesExtrasRoutes from './forkExtras/placesExtras';
import tripsExtrasRoutes from './forkExtras/tripsExtras';
import adminExtrasRoutes from './forkExtras/adminExtras';
import atlasExtrasRoutes from './forkExtras/atlasExtras';
import vacayExtrasRoutes from './forkExtras/vacayExtras';
import categoriesExtrasRoutes from './forkExtras/categoriesExtras';

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

  // bootstrap runs with `bodyParser: false` (Nest parses after init), so the
  // pre-init fork routers need their own parsers. They are wrapped in
  // differently-named functions: Nest scans the Express stack for middleware
  // literally named 'jsonParser'/'urlencodedParser' and skips registering its
  // own global parser when it finds one — which would leave every Nest route
  // without a parsed body. express.json sets req._body, so Nest's parser
  // still skips requests these wrappers already parsed.
  const jsonMw = express.json({ limit: '100kb' });
  const urlencodedMw = express.urlencoded({ extended: true });
  const legacyJson: express.RequestHandler = (req, res, next) => jsonMw(req, res, next);
  const legacyUrlencoded: express.RequestHandler = (req, res, next) => urlencodedMw(req, res, next);
  const use = (path: string, ...handlers: express.RequestHandler[]) => app.use(path, legacyJson, legacyUrlencoded, ...handlers);

  use('/api/groups/:groupId/date-proposals', dateProposalsRoutes);
  use('/api/date-proposals', dateProposalsMineRouter);
  use('/api/availability', availabilityRoutes);
  use('/api/guest/availability', guestAvailabilityRoutes);
  use('/api/visits', visitorInsightsRoutes);
  use('/api/addons/groups', groupsRoutes);
  use('/api/addons/explore', exploreRoutes);
  use('/api/addons/explore/payments', explorePaymentsRoutes);
  use('/api/addons/explore/creator-hub/lib', creatorHubLibRoutes);
  use('/api/public/lib', publicLibRouter);
  use('/api/addons/explore/creator-hub/affiliates', creatorHubAffiliatesRoutes);
  use('/api/public/go', publicAffiliateRouter);
  use('/api/addons/explore/creator-hub/tips', creatorHubTipsRoutes);
  use('/api/mollie', mollieConnectRoutes);
  use('/webhooks/mollie', mollieWebhookRoutes);
  use('/api/addons/worldmap', worldmapRoutes);
  use('/api/admin/backup-v2', adminImportRouter);
  use('/api/admin/backup-v2', schedulesRouter);
  use('/api/user', userExportRouter);
  use('/api/user', userGdprRouter);
  use('/api/admin/gdpr', adminGdprRouter);

  // Fork-only endpoints extracted from the pre-NestJS route files. Each router
  // only matches its own added paths; everything else next()s into the Nest
  // controllers (same prefix, registered after init).
  use('/api', shareExtrasRoutes);
  use('/api/trips/:tripId/places', placesExtrasRoutes);
  use('/api/trips', tripsExtrasRoutes);
  use('/api/admin', adminExtrasRoutes);
  use('/api/addons/atlas', atlasExtrasRoutes);
  use('/api/addons/vacay', vacayExtrasRoutes);
  use('/api/categories', categoriesExtrasRoutes);
}
