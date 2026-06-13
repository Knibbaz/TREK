/**
 * BDD step definitions for features/whitelabel.feature.
 * Exercises the superadmin-gated white-label config (forkExtras/adminExtras via
 * the legacy bridge) through the real Nest+Express app.
 */
import { vi, beforeAll, beforeEach, afterAll, expect } from 'vitest';
import request from 'supertest';
import { resolve } from 'node:path';

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
import { loadFeature, runFeature, type World } from './support/gherkin';

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

const WL = '/api/admin/whitelabel-config';

const feature = loadFeature(resolve(__dirname, 'features/whitelabel.feature'));

runFeature(feature, ({ given, when, then }) => {
  given('a signed-in superadmin', (w: World) => {
    const { user } = createUser(testDb, { role: 'superadmin' });
    w.cookie = authCookie(user.id);
  });

  given('a signed-in admin', (w: World) => {
    const { user } = createUser(testDb, { role: 'admin' });
    w.cookie = authCookie(user.id);
  });

  when('the superadmin hides the admin tab {string}', async (w: World, tab: string) => {
    w.res = await request(app).put(WL).set('Cookie', w.cookie as string).send({ disabled_admin_tabs: [tab] });
  });

  when('the admin tries to hide the admin tab {string}', async (w: World, tab: string) => {
    w.res = await request(app).put(WL).set('Cookie', w.cookie as string).send({ disabled_admin_tabs: [tab] });
  });

  when('the admin reads the white-label config', async (w: World) => {
    w.res = await request(app).get(WL).set('Cookie', w.cookie as string);
  });

  then('the response status is {int}', (w: World, code: number) => {
    expect((w.res as { status: number }).status).toBe(code);
  });

  then('the disabled admin tabs include {string}', (w: World, tab: string) => {
    const body = (w.res as { body: { disabled_admin_tabs: string[] } }).body;
    expect(body.disabled_admin_tabs).toContain(tab);
  });
});
