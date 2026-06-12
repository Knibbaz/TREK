/**
 * Explore marketplace integration tests.
 * Covers EXPLORE-001 to EXPLORE-020.
 *
 * Behaviour-driven: each test name describes a user-visible outcome.
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
    getPlaceWithTags: (placeId: number) => {
      const place: any = db.prepare(`SELECT p.*, c.name as category_name, c.color as category_color, c.icon as category_icon FROM places p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?`).get(placeId);
      if (!place) return null;
      const tags = db.prepare(`SELECT t.* FROM tags t JOIN place_tags pt ON t.id = pt.tag_id WHERE pt.place_id = ?`).all(placeId);
      return { ...place, category: place.category_id ? { id: place.category_id, name: place.category_name, color: place.category_color, icon: place.category_icon } : null, tags };
    },
    canAccessTrip: (tripId: any, userId: number) =>
      db.prepare(`SELECT t.id, t.user_id FROM trips t LEFT JOIN trip_members m ON m.trip_id = t.id AND m.user_id = ? WHERE t.id = ? AND (t.user_id = ? OR m.user_id IS NOT NULL)`).get(userId, tripId, userId),
    isOwner: (tripId: any, userId: number) =>
      !!db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId),
  };
  return { testDb: db, dbMock: mock };
});

vi.mock('../../src/db/database', () => dbMock);
vi.mock('../../src/config', () => ({
  JWT_SECRET: 'test-jwt-secret-for-trek-testing-only',
  ENCRYPTION_KEY: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2',
  updateJwtSecret: () => {},
  // ROUTD fork config keys (module-load reads in fork services)
  APP_URL: 'http://localhost:3001',
  PROJECT_METADATA: { modifiedBy: { name: 'Bas', url: '' }, originalBy: { name: 'Maurice', url: '' } },
  GOOGLE_PLACES_API_KEY: '',
  UNSPLASH_API_KEY: '',
  MOLLIE_CLIENT_ID: '',
  MOLLIE_CLIENT_SECRET: '',
  MOLLIE_API_KEY: '',
  PLATFORM_FEE_PERCENT: 10,
}));

import type { INestApplication } from '@nestjs/common';
import { buildApp } from '../../src/bootstrap';
import { createTables } from '../../src/db/schema';
import { runMigrations } from '../../src/db/migrations';
import { resetTestDb } from '../helpers/test-db';
import { createUser, createAdmin, createTrip, createDay, createPlace, createDayAssignment, createCategory } from '../helpers/factories';
import { authCookie } from '../helpers/auth';

let nestApp: INestApplication;
let app: Application;

beforeAll(async () => {
  createTables(testDb);
  runMigrations(testDb);
  nestApp = await buildApp();
  app = nestApp.getHttpAdapter().getInstance();
});

afterAll(async () => {
  await nestApp?.close();
});

beforeEach(() => {
  resetTestDb(testDb);
});

afterAll(() => {
  testDb.close();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function publishTrip(
  tripId: number,
  overrides: Partial<{
    price: number;
    is_published: number;
    listing_title: string;
    tagline: string;
    tags: string;
    destination: string;
    difficulty: string;
    community_enabled: number;
  }> = {}
): void {
  testDb.prepare(`
    INSERT INTO explore_published (
      trip_id, price, is_published, version, descriptions, community_enabled,
      listing_title, tagline, tags, destination, difficulty, best_season, created_at, updated_at
    ) VALUES (?, ?, ?, 1, '{}', ?, ?, ?, ?, ?, ?, '[]', datetime('now'), datetime('now'))
    ON CONFLICT(trip_id) DO UPDATE SET
      price = excluded.price,
      is_published = excluded.is_published,
      listing_title = excluded.listing_title,
      tagline = excluded.tagline,
      tags = excluded.tags,
      destination = excluded.destination,
      difficulty = excluded.difficulty,
      best_season = excluded.best_season,
      community_enabled = excluded.community_enabled,
      updated_at = datetime('now')
  `).run(
    tripId,
    overrides.price ?? 0,
    overrides.is_published ?? 1,
    overrides.community_enabled ?? 0,
    overrides.listing_title ?? null,
    overrides.tagline ?? null,
    overrides.tags ?? '[]',
    overrides.destination ?? null,
    overrides.difficulty ?? 'easy'
  );
}

// ── Browse ───────────────────────────────────────────────────────────────────

describe('Explore Browse', () => {
  it('EXPLORE-001 — returns published trips with pagination', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { title: 'Visible Trip' });
    publishTrip(trip.id);

    const res = await request(app)
      .get('/api/addons/explore/trips')
      .set('Cookie', authCookie(user.id));

    expect(res.status).toBe(200);
    expect(res.body.trips).toHaveLength(1);
    expect(res.body.trips[0].title).toBe('Visible Trip');
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
  });

  it('EXPLORE-002 — unpublished trips are hidden from browse', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { title: 'Hidden Trip' });
    publishTrip(trip.id, { is_published: 0 });

    const res = await request(app)
      .get('/api/addons/explore/trips')
      .set('Cookie', authCookie(user.id));

    expect(res.status).toBe(200);
    expect(res.body.trips).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  it('EXPLORE-003 — search filters by title', async () => {
    const { user } = createUser(testDb);
    const t1 = createTrip(testDb, user.id, { title: 'Japan Adventure' });
    const t2 = createTrip(testDb, user.id, { title: 'Italy Food Tour' });
    publishTrip(t1.id, { listing_title: 'Japan Adventure' });
    publishTrip(t2.id, { listing_title: 'Italy Food Tour' });

    const res = await request(app)
      .get('/api/addons/explore/trips?q=japan')
      .set('Cookie', authCookie(user.id));

    expect(res.status).toBe(200);
    expect(res.body.trips).toHaveLength(1);
    expect(res.body.trips[0].title).toBe('Japan Adventure');
  });

  it('EXPLORE-004 — price range filter works', async () => {
    const { user } = createUser(testDb);
    const t1 = createTrip(testDb, user.id, { title: 'Cheap' });
    const t2 = createTrip(testDb, user.id, { title: 'Expensive' });
    publishTrip(t1.id, { price: 5 });
    publishTrip(t2.id, { price: 50 });

    const res = await request(app)
      .get('/api/addons/explore/trips?minPrice=10&maxPrice=100')
      .set('Cookie', authCookie(user.id));

    expect(res.status).toBe(200);
    expect(res.body.trips).toHaveLength(1);
    expect(res.body.trips[0].title).toBe('Expensive');
  });

  it('EXPLORE-005 — destination filter works', async () => {
    const { user } = createUser(testDb);
    const t1 = createTrip(testDb, user.id, { title: 'Tokyo' });
    const t2 = createTrip(testDb, user.id, { title: 'Rome' });
    publishTrip(t1.id, { destination: 'Japan' });
    publishTrip(t2.id, { destination: 'Italy' });

    const res = await request(app)
      .get('/api/addons/explore/trips?destination=Japan')
      .set('Cookie', authCookie(user.id));

    expect(res.status).toBe(200);
    expect(res.body.trips).toHaveLength(1);
    expect(res.body.trips[0].title).toBe('Tokyo');
  });

  it('EXPLORE-006 — difficulty filter works', async () => {
    const { user } = createUser(testDb);
    const t1 = createTrip(testDb, user.id, { title: 'Easy Walk' });
    const t2 = createTrip(testDb, user.id, { title: 'Hard Trek' });
    publishTrip(t1.id, { difficulty: 'easy' });
    publishTrip(t2.id, { difficulty: 'hard' });

    const res = await request(app)
      .get('/api/addons/explore/trips?difficulty=hard')
      .set('Cookie', authCookie(user.id));

    expect(res.status).toBe(200);
    expect(res.body.trips).toHaveLength(1);
    expect(res.body.trips[0].title).toBe('Hard Trek');
  });

  it('EXPLORE-007 — sort by price ascending', async () => {
    const { user } = createUser(testDb);
    const t1 = createTrip(testDb, user.id, { title: 'Mid' });
    const t2 = createTrip(testDb, user.id, { title: 'Low' });
    const t3 = createTrip(testDb, user.id, { title: 'High' });
    publishTrip(t1.id, { price: 20 });
    publishTrip(t2.id, { price: 10 });
    publishTrip(t3.id, { price: 30 });

    const res = await request(app)
      .get('/api/addons/explore/trips?sort=price_asc')
      .set('Cookie', authCookie(user.id));

    expect(res.status).toBe(200);
    expect(res.body.trips.map((t: any) => t.title)).toEqual(['Low', 'Mid', 'High']);
  });

  it('EXPLORE-008 — pagination returns correct slice', async () => {
    const { user } = createUser(testDb);
    for (let i = 1; i <= 5; i++) {
      const t = createTrip(testDb, user.id, { title: `Trip ${i}` });
      publishTrip(t.id);
    }

    const res = await request(app)
      .get('/api/addons/explore/trips?page=2&limit=2')
      .set('Cookie', authCookie(user.id));

    expect(res.status).toBe(200);
    expect(res.body.trips).toHaveLength(2);
    expect(res.body.total).toBe(5);
    expect(res.body.page).toBe(2);
  });

  it('EXPLORE-009 — tag filter works', async () => {
    const { user } = createUser(testDb);
    const t1 = createTrip(testDb, user.id, { title: 'Beach Trip' });
    const t2 = createTrip(testDb, user.id, { title: 'City Trip' });
    publishTrip(t1.id, { tags: JSON.stringify(['beach', 'sun']) });
    publishTrip(t2.id, { tags: JSON.stringify(['city', 'culture']) });

    const res = await request(app)
      .get('/api/addons/explore/trips?tag=beach')
      .set('Cookie', authCookie(user.id));

    expect(res.status).toBe(200);
    expect(res.body.trips).toHaveLength(1);
    expect(res.body.trips[0].title).toBe('Beach Trip');
  });
});

// ── Detail ─────────────────────────────────────────────────────────────────────

describe('Explore Detail', () => {
  it('EXPLORE-010 — returns trip with days, places and category stats', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { title: 'Detail Trip' });
    const day = createDay(testDb, trip.id, { day_number: 1 });
    const cat = createCategory(testDb, { name: 'Museum', color: '#ef4444', icon: '🏛️' });
    const place = createPlace(testDb, trip.id, { name: 'Louvre', lat: 48.86, lng: 2.33, category_id: cat.id });
    createDayAssignment(testDb, day.id, place.id);
    publishTrip(trip.id);

    const res = await request(app)
      .get(`/api/addons/explore/trips/${trip.id}`)
      .set('Cookie', authCookie(user.id));

    expect(res.status).toBe(200);
    expect(res.body.trip.title).toBe('Detail Trip');
    expect(res.body.days).toHaveLength(1);
    expect(res.body.days[0].places).toHaveLength(1);
    expect(res.body.category_stats).toHaveLength(1);
    expect(res.body.category_stats[0].name).toBe('Museum');
    expect(res.body.category_stats[0].count).toBe(1);
    expect(res.body.total_budget_estimate).toBe(0);
  });

  it('EXPLORE-011 — increments view count on each detail load', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    publishTrip(trip.id);

    await request(app)
      .get(`/api/addons/explore/trips/${trip.id}`)
      .set('Cookie', authCookie(user.id));
    const after1 = testDb.prepare('SELECT view_count FROM explore_published WHERE trip_id = ?').get(trip.id) as { view_count: number };
    expect(after1.view_count).toBe(1);

    await request(app)
      .get(`/api/addons/explore/trips/${trip.id}`)
      .set('Cookie', authCookie(user.id));
    const after2 = testDb.prepare('SELECT view_count FROM explore_published WHERE trip_id = ?').get(trip.id) as { view_count: number };
    expect(after2.view_count).toBe(2);
  });

  it('EXPLORE-012 — first 3 places are unblurred highlights, rest is blurred', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const day = createDay(testDb, trip.id);
    for (let i = 0; i < 5; i++) {
      const p = createPlace(testDb, trip.id, { name: `Place ${i}`, lat: 48.86 + i * 0.01, lng: 2.33 });
      createDayAssignment(testDb, day.id, p.id);
    }
    publishTrip(trip.id);

    const res = await request(app)
      .get(`/api/addons/explore/trips/${trip.id}`)
      .set('Cookie', authCookie(user.id));

    expect(res.status).toBe(200);
    const places = res.body.days[0].places;
    expect(places).toHaveLength(5);
    // First 3 should be exact (highlights)
    for (let i = 0; i < 3; i++) {
      expect(places[i].is_highlight).toBe(true);
      expect(places[i].lat).toBeCloseTo(48.86 + i * 0.01, 4);
    }
    // Remaining should be blurred (offset from original)
    for (let i = 3; i < 5; i++) {
      expect(places[i].is_highlight).toBe(false);
      expect(places[i].lat).not.toBe(48.86 + i * 0.01);
    }
  });

  it('EXPLORE-013 — already_purchased is false when user never bought the trip', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    publishTrip(trip.id);

    const res = await request(app)
      .get(`/api/addons/explore/trips/${trip.id}`)
      .set('Cookie', authCookie(user.id));

    expect(res.status).toBe(200);
    expect(res.body.already_purchased).toBe(false);
    expect(res.body.user_trip_id).toBeNull();
  });

  it('EXPLORE-014 — already_purchased is true and user_trip_id returned after purchase', async () => {
    const { user: creator } = createUser(testDb);
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, creator.id);
    publishTrip(trip.id);

    await request(app)
      .post(`/api/addons/explore/trips/${trip.id}/purchase`)
      .set('Cookie', authCookie(user.id))
      .send({ title: trip.title });

    const res = await request(app)
      .get(`/api/addons/explore/trips/${trip.id}`)
      .set('Cookie', authCookie(user.id));

    expect(res.status).toBe(200);
    expect(res.body.already_purchased).toBe(true);
    expect(typeof res.body.user_trip_id).toBe('number');
  });

  it('EXPLORE-015 — 404 for unpublished trip detail', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    // Not published

    const res = await request(app)
      .get(`/api/addons/explore/trips/${trip.id}`)
      .set('Cookie', authCookie(user.id));

    expect(res.status).toBe(404);
  });
});

// ── Purchase ───────────────────────────────────────────────────────────────────

describe('Explore Purchase', () => {
  it('EXPLORE-016 — free purchase copies trip and tracks ownership', async () => {
    const { user: creator } = createUser(testDb);
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, creator.id, { title: 'Freebie' });
    publishTrip(trip.id, { price: 0 });

    const res = await request(app)
      .post(`/api/addons/explore/trips/${trip.id}/purchase`)
      .set('Cookie', authCookie(user.id))
      .send({ title: 'Freebie Copy' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.trip_id).toBe('number');
    expect(res.body.message).toMatch(/added to your trips/i);

    // Ownership tracked
    const link = testDb.prepare('SELECT * FROM explore_user_trips WHERE user_id = ? AND source_trip_id = ?').get(user.id, trip.id);
    expect(link).toBeDefined();
  });

  it('EXPLORE-017 — free purchase increments purchase_count', async () => {
    const { user: creator } = createUser(testDb);
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, creator.id);
    publishTrip(trip.id, { price: 0 });

    await request(app)
      .post(`/api/addons/explore/trips/${trip.id}/purchase`)
      .set('Cookie', authCookie(user.id))
      .send({ title: trip.title });

    const row = testDb.prepare('SELECT purchase_count FROM explore_published WHERE trip_id = ?').get(trip.id) as { purchase_count: number };
    expect(row.purchase_count).toBe(1);
  });

  it('EXPLORE-018 — purchasing twice returns 409 already owned', async () => {
    const { user: creator } = createUser(testDb);
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, creator.id);
    publishTrip(trip.id, { price: 0 });

    await request(app)
      .post(`/api/addons/explore/trips/${trip.id}/purchase`)
      .set('Cookie', authCookie(user.id))
      .send({ title: trip.title });

    const res2 = await request(app)
      .post(`/api/addons/explore/trips/${trip.id}/purchase`)
      .set('Cookie', authCookie(user.id))
      .send({ title: trip.title });

    expect(res2.status).toBe(409);
    expect(res2.body.error).toMatch(/already owned/i);
  });

  it('EXPLORE-019 — paid trip purchase returns PAYMENT_REQUIRED', async () => {
    const { user: creator } = createUser(testDb);
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, creator.id);
    publishTrip(trip.id, { price: 10 });

    const res = await request(app)
      .post(`/api/addons/explore/trips/${trip.id}/purchase`)
      .set('Cookie', authCookie(user.id))
      .send({ title: trip.title });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PAYMENT_REQUIRED');
  });

  it('EXPLORE-020 — browse response excludes unpublished trips from total count', async () => {
    const { user } = createUser(testDb);
    const t1 = createTrip(testDb, user.id);
    const t2 = createTrip(testDb, user.id);
    publishTrip(t1.id);
    publishTrip(t2.id, { is_published: 0 });

    const res = await request(app)
      .get('/api/addons/explore/trips')
      .set('Cookie', authCookie(user.id));

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.trips).toHaveLength(1);
  });
});
