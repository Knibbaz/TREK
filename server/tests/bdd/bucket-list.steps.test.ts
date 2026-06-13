/**
 * BDD step definitions for features/bucket-list.feature.
 * Drives the real Nest app (atlas controller) over supertest, mirroring the
 * proven integration harness (inline db/config mocks so Nest decorators load
 * after the mocks are in place).
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

const BUCKET = '/api/addons/atlas/bucket-list';
const list = (cookie: string) => request(app).get(BUCKET).set('Cookie', cookie);

const feature = loadFeature(resolve(__dirname, 'features/bucket-list.feature'));

runFeature(feature, ({ given, when, then }) => {
  given('a signed-in user', (w: World) => {
    const { user } = createUser(testDb);
    w.userId = user.id;
    w.cookie = authCookie(user.id);
  });

  given('another signed-in user', (w: World) => {
    const { user } = createUser(testDb);
    w.otherId = user.id;
    w.otherCookie = authCookie(user.id);
  });

  given('the user has a bucket list item {string} in country {string}', async (w: World, name: string, code: string) => {
    const res = await request(app).post(BUCKET).set('Cookie', w.cookie as string).send({ name, country_code: code });
    expect(res.status).toBe(201);
    w.itemId = (res.body.item as { id: number }).id;
  });

  when('the user adds {string} in country {string} to their bucket list', async (w: World, name: string, code: string) => {
    w.res = await request(app).post(BUCKET).set('Cookie', w.cookie as string).send({ name, country_code: code });
  });

  when('the first user adds {string} in country {string} to their bucket list', async (w: World, name: string, code: string) => {
    w.res = await request(app).post(BUCKET).set('Cookie', w.cookie as string).send({ name, country_code: code });
  });

  when('the user deletes that bucket list item', async (w: World) => {
    w.res = await request(app).delete(`${BUCKET}/${w.itemId}`).set('Cookie', w.cookie as string);
  });

  then('the response status is {int}', (w: World, code: number) => {
    expect((w.res as { status: number }).status).toBe(code);
  });

  then('the bucket list contains {string}', async (w: World, name: string) => {
    const res = await list(w.cookie as string);
    const names = (res.body.items as { name: string }[]).map(i => i.name);
    expect(names).toContain(name);
  });

  then('the bucket list does not contain {string}', async (w: World, name: string) => {
    const res = await list(w.cookie as string);
    const names = (res.body.items as { name: string }[]).map(i => i.name);
    expect(names).not.toContain(name);
  });

  then("the other user's bucket list does not contain {string}", async (w: World, name: string) => {
    const res = await list(w.otherCookie as string);
    const names = (res.body.items as { name: string }[]).map(i => i.name);
    expect(names).not.toContain(name);
  });
});
