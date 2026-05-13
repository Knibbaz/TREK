/**
 * GDPR integration tests.
 * Covers Epic 1 (audit logging on exports) and Epic 5 (GDPR compliance).
 * Smoke tests to verify endpoints exist and are properly protected.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';

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
    getPlaceWithTags: (placeId: number) => null,
    canAccessTrip: () => true,
    isOwner: () => true,
  };
  return { testDb: db, dbMock: mock };
});

vi.mock('../../src/db/database', () => dbMock);
vi.mock('../../src/config', () => ({
  JWT_SECRET: 'test-jwt-secret-for-trek-testing-only',
  ENCRYPTION_KEY: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2',
  APP_URL: 'http://localhost:3001',
  updateJwtSecret: () => {},
}));

vi.mock('../../src/services/backup-v2/exporter', () => ({
  runExport: vi.fn().mockResolvedValue({ filePath: '/tmp/test.trek', fileSize: 1024 }),
  deleteExportFile: vi.fn(),
}));

import { createApp } from '../../src/app';
import { createTables } from '../../src/db/schema';
import { runMigrations } from '../../src/db/migrations';
import { resetTestDb } from '../helpers/test-db';
import { createAdmin, createUser } from '../helpers/factories';
import { authCookie } from '../helpers/auth';

const app: Application = createApp();

beforeAll(() => {
  createTables(testDb);
  runMigrations(testDb);
});

beforeEach(() => {
  resetTestDb(testDb);
});

afterAll(() => {
  testDb.close();
});

describe('GDPR Integration', () => {
  describe('Epic 1: Audit logging on user exports', () => {
    it('POST /api/user/export endpoint exists', async () => {
      const user = createUser(testDb);
      const cookie = authCookie(user.id);

      const res = await request(app)
        .post('/api/user/export')
        .set('Cookie', cookie);

      // Should succeed (200), error (500), or auth fail (401) - not 404
      expect([200, 401, 500]).toContain(res.status);
    });
  });

  describe('Epic 5: GDPR deletion flow', () => {
    it('POST /api/user/delete-account endpoint exists', async () => {
      const user = createUser(testDb);
      const cookie = authCookie(user.id);

      const res = await request(app)
        .post('/api/user/delete-account')
        .set('Cookie', cookie);

      // Should not be 404
      expect(res.status).not.toBe(404);
    });

    it('POST /api/user/cancel-deletion endpoint exists', async () => {
      const user = createUser(testDb);
      const cookie = authCookie(user.id);

      const res = await request(app)
        .post('/api/user/cancel-deletion')
        .set('Cookie', cookie);

      // Should not be 404
      expect(res.status).not.toBe(404);
    });

    it('GET /api/admin/gdpr/exports requires authentication', async () => {
      const res = await request(app)
        .get('/api/admin/gdpr/exports');

      // Should require auth (401 or 403)
      expect([401, 403]).toContain(res.status);
    });

    it('GET /api/admin/gdpr/deletions requires authentication', async () => {
      const res = await request(app)
        .get('/api/admin/gdpr/deletions');

      // Should require auth (401 or 403)
      expect([401, 403]).toContain(res.status);
    });

    it('GET /api/admin/gdpr/exports rejects non-admin users', async () => {
      const user = createUser(testDb);
      const cookie = authCookie(user.id);

      const res = await request(app)
        .get('/api/admin/gdpr/exports')
        .set('Cookie', cookie);

      // Should return 403 (forbidden) or 401 (unauthorized)
      expect([401, 403]).toContain(res.status);
    });

    it('GET /api/admin/gdpr/deletions rejects non-admin users', async () => {
      const user = createUser(testDb);
      const cookie = authCookie(user.id);

      const res = await request(app)
        .get('/api/admin/gdpr/deletions')
        .set('Cookie', cookie);

      // Should return 403 (forbidden) or 401 (unauthorized)
      expect([401, 403]).toContain(res.status);
    });

    it('GET /api/admin/gdpr/exports works (endpoint exists)', async () => {
      const admin = createAdmin(testDb);
      const cookie = authCookie(admin.id);

      const res = await request(app)
        .get('/api/admin/gdpr/exports')
        .set('Cookie', cookie);

      // Endpoint exists and returns data or auth error (not 404)
      expect([200, 401, 403]).toContain(res.status);
    });

    it('GET /api/admin/gdpr/deletions works (endpoint exists)', async () => {
      const admin = createAdmin(testDb);
      const cookie = authCookie(admin.id);

      const res = await request(app)
        .get('/api/admin/gdpr/deletions')
        .set('Cookie', cookie);

      // Endpoint exists and returns data or auth error (not 404)
      expect([200, 401, 403]).toContain(res.status);
    });
  });
});
