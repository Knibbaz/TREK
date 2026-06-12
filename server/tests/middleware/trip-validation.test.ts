/* Trip validation middleware tests */
import { describe, it, beforeEach, afterEach, vi, expect } from 'vitest';
import { validateTripRequirements } from '../../src/middleware/trip-validation';
import { db } from '../../src/db/database';

describe('Trip Validation Middleware', () => {
  beforeEach(() => {
    // Setup test database
    db.prepare(`
      CREATE TABLE IF NOT EXISTS trip_requirements (
        id TEXT PRIMARY KEY,
        min_places INTEGER DEFAULT 5,
        min_days INTEGER DEFAULT 3,
        min_category_percentage INTEGER DEFAULT 80,
        require_header_photo BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    db.prepare(`DELETE FROM trip_requirements`).run();
    db.prepare(`
      INSERT INTO trip_requirements (id) VALUES ('1')
    `).run();
  });

  afterEach(() => {
    db.prepare('DELETE FROM trip_requirements').run();
  });

  it('should pass valid trip', () => {
    const req = {
      body: {
        places: [
          { id: '1', name: 'Place 1', category: 'sightseeing' },
          { id: '2', name: 'Place 2', category: 'sightseeing' },
          { id: '3', name: 'Place 3', category: 'sightseeing' },
          { id: '4', name: 'Place 4', category: 'sightseeing' },
          { id: '5', name: 'Place 5', category: 'sightseeing' }
        ],
        days: [
          { id: '1', activities: [{ id: '1', name: 'Activity 1' }] },
          { id: '2', activities: [{ id: '2', name: 'Activity 2' }] },
          { id: '3', activities: [{ id: '3', name: 'Activity 3' }] }
        ],
        headerPhoto: 'photo.jpg'
      }
    };
    const next = vi.fn();
    const res = { status: vi.fn(() => res), json: vi.fn(() => res) } as any;

    validateTripRequirements(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should reject trip with insufficient places', () => {
    const req = {
      body: {
        places: [{ id: '1', name: 'Place 1' }],
        days: [
          { id: '1', activities: [{ id: '1', name: 'Activity 1' }] },
          { id: '2', activities: [{ id: '2', name: 'Activity 2' }] },
          { id: '3', activities: [{ id: '3', name: 'Activity 3' }] }
        ],
        headerPhoto: 'photo.jpg'
      }
    };
    const next = vi.fn();
    const res = { status: vi.fn(() => res), json: vi.fn(() => res) } as any;

    validateTripRequirements(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should reject trip without header photo', () => {
    const req = {
      body: {
        places: [
          { id: '1', name: 'Place 1' },
          { id: '2', name: 'Place 2' },
          { id: '3', name: 'Place 3' },
          { id: '4', name: 'Place 4' },
          { id: '5', name: 'Place 5' }
        ],
        days: [
          { id: '1', activities: [{ id: '1', name: 'Activity 1' }] },
          { id: '2', activities: [{ id: '2', name: 'Activity 2' }] },
          { id: '3', activities: [{ id: '3', name: 'Activity 3' }] }
        ],
        headerPhoto: null
      }
    };
    const next = vi.fn();
    const res = { status: vi.fn(() => res), json: vi.fn(() => res) } as any;

    validateTripRequirements(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should reject trip with insufficient category percentage', () => {
    const req = {
      body: {
        places: [
          { id: '1', name: 'Place 1' },
          { id: '2', name: 'Place 2' },
          { id: '3', name: 'Place 3' },
          { id: '4', name: 'Place 4' },
          { id: '5', name: 'Place 5' }
        ],
        days: [
          { id: '1', activities: [{ id: '1', name: 'Activity 1' }] },
          { id: '2', activities: [{ id: '2', name: 'Activity 2' }] },
          { id: '3', activities: [{ id: '3', name: 'Activity 3' }] }
        ],
        headerPhoto: 'photo.jpg'
      }
    };
    const next = vi.fn();
    const res = { status: vi.fn(() => res), json: vi.fn(() => res) } as any;

    validateTripRequirements(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});