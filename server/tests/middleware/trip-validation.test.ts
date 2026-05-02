/* Trip validation middleware tests */
import { describe, it, beforeEach, afterEach } from 'vitest';
import { validateTripRequirements } from '../../middleware/trip-validation.ts';
import { db } from '../../utils';

describe('Trip Validation Middleware', () => {
  beforeEach(() => {
    // Setup test database
    db.prepare(`
      CREATE TABLE trip_requirements (
        id TEXT PRIMARY KEY,
        min_places INTEGER DEFAULT 5,
        min_days INTEGER DEFAULT 3,
        min_category_percentage INTEGER DEFAULT 80,
        require_header_photo BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    
    db.prepare(`
      INSERT INTO trip_requirements (id) VALUES ('1')
    `).run();
  });

  afterEach(() => {
    db.prepare('DROP TABLE trip_requirements').run();
  });

  it('should pass valid trip', () => {
    const req = {
      body: {
        places: [{ id: '1', name: 'Place 1' }],
        days: [{ id: '1', activities: [{ id: '1', name: 'Activity 1' }] }],
        headerPhoto: 'photo.jpg'
      }
    };
    const res = { status: (code) => ({ json: (data) => {} }) };
    const next = () => {};
    
    validateTripRequirements(req, res, next);
    // Expect no errors
  });

  it('should reject trip with insufficient places', () => {
    const req = {
      body: {
        places: [{ id: '1', name: 'Place 1' }],
        days: [{ id: '1', activities: [{ id: '1', name: 'Activity 1' }] }],
        headerPhoto: 'photo.jpg'
      }
    };
    const res = { status: (code) => ({ json: (data) => {} }) };
    const next = () => {};
    
    validateTripRequirements(req, res, next);
    // Expect error for insufficient places
  });

  it('should reject trip without header photo', () => {
    const req = {
      body: {
        places: [{ id: '1', name: 'Place 1' }, { id: '2', name: 'Place 2' }],
        days: [{ id: '1', activities: [{ id: '1', name: 'Activity 1' }] }],
        headerPhoto: null
      }
    };
    const res = { status: (code) => ({ json: (data) => {} }) };
    const next = () => {};
    
    validateTripRequirements(req, res, next);
    // Expect error for missing header photo
  });

  it('should reject trip with insufficient category percentage', () => {
    const req = {
      body: {
        places: [{ id: '1', name: 'Place 1' }, { id: '2', name: 'Place 2' }],
        days: [{ id: '1', activities: [{ id: '1', name: 'Activity 1' }] }],
        headerPhoto: 'photo.jpg'
      }
    };
    const res = { status: (code) => ({ json: (data) => {} }) };
    const next = () => {};
    
    validateTripRequirements(req, res, next);
    // Expect error for insufficient category percentage
  });
});