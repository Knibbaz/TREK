/**
 * BDD-style (in-TypeScript, no .feature file) behaviour spec for the ROUTD
 * visitor-insights endpoints — the other half of the hybrid approach. Same
 * Given/When/Then vocabulary via the bdd helper, driving the real app.
 */
import { vi, beforeAll, beforeEach, afterAll, expect } from 'vitest';
import request from 'supertest';

const { testDb, dbMock } = vi.hoisted(() => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  const mock = {
    db,
    closeDb: () => {},
    reinitialize: () => {},
    canAccessTrip: () => undefined,
    isOwner: () => false,
    canAccessGroup: () => false,
    getPlaceWithTags: () => null,
  };
  return { testDb: db, dbMock: mock };
});

vi.mock('../../src/db/database', () => dbMock);
vi.mock('../../src/config', () => ({
  JWT_SECRET: 'test-jwt-secret-for-trek-testing-only',
  ENCRYPTION_KEY: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2',
  updateJwtSecret: () => {},
  APP_URL: 'http://localhost:3001',
  PROJECT_METADATA: { modifiedBy: { name: 'Bas', url: '' }, originalBy: { name: 'Maurice', url: '' } },
  GOOGLE_PLACES_API_KEY: '', UNSPLASH_API_KEY: '',
  MOLLIE_CLIENT_ID: '', MOLLIE_CLIENT_SECRET: '', MOLLIE_API_KEY: '', PLATFORM_FEE_PERCENT: 10,
}));

import type { INestApplication } from '@nestjs/common';
import type { Application } from 'express';
import { buildApp } from '../../src/bootstrap';
import { createTables } from '../../src/db/schema';
import { runMigrations } from '../../src/db/migrations';
import { resetTestDb } from '../helpers/test-db';
import { createUser } from '../helpers/factories';
import { authCookie } from '../helpers/auth';
import { Feature, Scenario, Given, When, Then, And } from './support/bdd';

let nestApp: INestApplication;
let app: Application;

beforeAll(async () => {
  createTables(testDb);
  runMigrations(testDb);
  nestApp = await buildApp();
  app = nestApp.getHttpAdapter().getInstance();
});
afterAll(async () => { await nestApp?.close(); });
beforeEach(() => { resetTestDb(testDb); });

const VISITS = '/api/visits';

Feature('Visitor insights for public pages', () => {
  Scenario('an anonymous visit with a referrer is recorded and aggregated', async () => {
    let visitRes: request.Response;
    let insights: { body: { totals: { page_type: string; visits: number }[]; referrers: { host: string; count: number }[] } };

    await Given('a published page is visited anonymously from a blog referrer', async () => {
      visitRes = await request(app)
        .post(VISITS)
        .send({ page_type: 'shared_trip', page_ref: 'tok-123', referrer: 'https://reisgenie.nl/australie' });
    });

    await Then('the visit is accepted without auth (204)', () => {
      expect(visitRes.status).toBe(204);
    });

    await When('an admin opens the visitor insights', async () => {
      const { user } = createUser(testDb, { role: 'admin' });
      insights = await request(app).get(`${VISITS}/insights`).set('Cookie', authCookie(user.id));
    });

    await Then('the shared_trip page shows one visit', () => {
      const row = insights.body.totals.find(t => t.page_type === 'shared_trip');
      expect(row?.visits).toBe(1);
    });

    await And('the blog referrer host appears in the breakdown', () => {
      const hosts = insights.body.referrers.map(r => r.host);
      expect(hosts).toContain('reisgenie.nl');
    });
  });

  Scenario('a non-admin cannot read visitor insights', async () => {
    let res: request.Response;

    await Given('a signed-in non-admin user', () => { /* created in the When */ });

    await When('the user requests the insights endpoint', async () => {
      const { user } = createUser(testDb, { role: 'user' });
      res = await request(app).get(`${VISITS}/insights`).set('Cookie', authCookie(user.id));
    });

    await Then('access is forbidden (403)', () => {
      expect(res.status).toBe(403);
    });
  });

  Scenario('an invalid page type is rejected', async () => {
    let res: request.Response;

    await When('a visit is posted with an unknown page type', async () => {
      res = await request(app).post(VISITS).send({ page_type: 'nope', page_ref: 'x' });
    });

    await Then('the request is rejected (400)', () => {
      expect(res.status).toBe(400);
    });
  });
});
