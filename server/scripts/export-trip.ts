#!/usr/bin/env tsx
/**
 * CLI tool to export trip data from the Trek database.
 *
 * Usage:
 *   cd server && npx tsx scripts/export-trip.ts [options]
 *
 * Options:
 *   --trip-id <id>        Export a specific trip by ID
 *   --user-id <id>        Filter trips by owner user ID
 *   --user-email <email>  Filter trips by owner email
 *   --format <json|csv|ics|bundle>  Output format (default: json)
 *   --output <path>       Write to file instead of stdout
 *   --archived            Include archived trips
 *   --all                 Export all trips (not just one)
 *   --with-places         Include places in JSON/CSV output
 *   --with-days           Include days in JSON/CSV output
 *   --with-budget         Include budget items in JSON/CSV output
 *   --with-packing        Include packing items in JSON/CSV output
 *   --with-reservations   Include reservations in JSON/CSV output
 *   --with-members        Include members in JSON/CSV output
 *
 * Examples:
 *   npx tsx scripts/export-trip.ts --trip-id 42 --format json --output trip-42.json
 *   npx tsx scripts/export-trip.ts --user-email bas@example.com --format csv --output my-trips.csv
 *   npx tsx scripts/export-trip.ts --trip-id 42 --format ics --output trip.ics
 *   npx tsx scripts/export-trip.ts --trip-id 42 --format bundle --output trip-bundle.json
 *   npx tsx scripts/export-trip.ts --all --format json | jq '.trips | length'
 */

import fs from 'fs';
import path from 'path';

// Ensure we read the DB at project-root/data/travel.db even when the script
// is invoked from inside the server/ directory.
const projectRoot = path.resolve(__dirname, '../..');
process.env.TREK_DB_PATH = path.join(projectRoot, 'data', 'travel.db');

// Suppress noisy init logs so JSON output stays valid on stdout
const originalLog = console.log;
console.log = (...args: any[]) => {
  const msg = args.join(' ');
  if (msg.includes('Encryption key persisted') || msg.includes('Default addons seeded')) return;
  originalLog.apply(console, args);
};

import { db } from '../src/db/database';
import { exportICS } from '../src/services/tripService';
import { listDays } from '../src/services/dayService';
import { listPlaces } from '../src/services/placeService';
import { listItems as listPackingItems } from '../src/services/packingService';
import { listItems as listTodoItems } from '../src/services/todoService';
import { listBudgetItems } from '../src/services/budgetService';
import { listReservations } from '../src/services/reservationService';
import { listFiles } from '../src/services/fileService';
import { listNotes as listCollabNotes } from '../src/services/collabService';

/* ── argument parsing ─────────────────────────────────────────────────── */

function parseArgs() {
  const args = process.argv.slice(2);
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.replace(/^--/, '');
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

function showUsage() {
  console.log(`
Usage: npx tsx scripts/export-trip.ts [options]

Options:
  --trip-id <id>        Export a specific trip by ID
  --user-id <id>        Filter trips by owner user ID
  --user-email <email>  Filter trips by owner email
  --format <format>     Output format: json, csv, ics, bundle (default: json)
  --output <path>       Write to file instead of stdout
  --archived            Include archived trips
  --all                 Export all matching trips
  --with-places         Include places in JSON/CSV output
  --with-days           Include days in JSON/CSV output
  --with-budget         Include budget items in JSON/CSV output
  --with-packing        Include packing items in JSON/CSV output
  --with-reservations   Include reservations in JSON/CSV output
  --with-members        Include members in JSON/CSV output
  --help                Show this help message

Examples:
  npx tsx scripts/export-trip.ts --trip-id 42 --format json --output trip-42.json
  npx tsx scripts/export-trip.ts --user-email bas@example.com --format csv
  npx tsx scripts/export-trip.ts --trip-id 42 --format ics --output trip.ics
  npx tsx scripts/export-trip.ts --trip-id 42 --format bundle --output bundle.json
  npx tsx scripts/export-trip.ts --all --archived --format json
`);
}

/* ── database queries ─────────────────────────────────────────────────── */

function getTrips(filters: {
  tripId?: number;
  userId?: number;
  userEmail?: string;
  archived?: boolean;
  all?: boolean;
}) {
  const conditions: string[] = ['1=1'];
  const params: (string | number)[] = [];

  if (filters.tripId) {
    conditions.push('t.id = ?');
    params.push(filters.tripId);
  }
  if (filters.userId) {
    conditions.push('t.user_id = ?');
    params.push(filters.userId);
  }
  if (filters.userEmail) {
    conditions.push('u.email = ?');
    params.push(filters.userEmail);
  }
  if (!filters.archived) {
    conditions.push('t.is_archived = 0');
  }

  const sql = `
    SELECT
      t.*,
      u.username as owner_username,
      u.email as owner_email,
      (SELECT COUNT(*) FROM days d WHERE d.trip_id = t.id) as day_count,
      (SELECT COUNT(*) FROM places p WHERE p.trip_id = t.id) as place_count
    FROM trips t
    JOIN users u ON u.id = t.user_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY t.created_at DESC
  `;

  if (filters.all || !filters.tripId) {
    return db.prepare(sql).all(...params) as any[];
  }
  const row = db.prepare(sql).get(...params) as any;
  return row ? [row] : [];
}

function getMembers(tripId: number) {
  const owner = db.prepare(`
    SELECT u.id, u.username, u.email, 'owner' as role
    FROM trips t
    JOIN users u ON u.id = t.user_id
    WHERE t.id = ?
  `).get(tripId) as any;

  const members = db.prepare(`
    SELECT u.id, u.username, u.email, 'member' as role
    FROM trip_members m
    JOIN users u ON u.id = m.user_id
    WHERE m.trip_id = ?
  `).all(tripId) as any[];

  return [owner, ...members].filter(Boolean);
}

function getPlaces(tripId: number) {
  return db.prepare(`
    SELECT p.*, c.name as category_name, c.color as category_color, c.icon as category_icon
    FROM places p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.trip_id = ?
    ORDER BY p.created_at ASC
  `).all(tripId) as any[];
}

function getDays(tripId: number) {
  const days = db.prepare(`
    SELECT d.* FROM days d
    WHERE d.trip_id = ?
    ORDER BY d.day_number ASC
  `).all(tripId) as any[];

  for (const day of days) {
    day.assignments = db.prepare(`
      SELECT da.*, p.name as place_name, p.address as place_address, p.lat, p.lng
      FROM day_assignments da
      JOIN places p ON p.id = da.place_id
      WHERE da.day_id = ?
      ORDER BY da.order_index ASC, da.created_at ASC
    `).all(day.id);

    day.notes = db.prepare(`
      SELECT * FROM day_notes
      WHERE day_id = ?
      ORDER BY sort_order ASC, created_at ASC
    `).all(day.id);
  }

  return days;
}

function getBudgetItems(tripId: number) {
  return db.prepare(`
    SELECT * FROM budget_items
    WHERE trip_id = ?
    ORDER BY sort_order ASC, created_at ASC
  `).all(tripId) as any[];
}

function getPackingItems(tripId: number) {
  return db.prepare(`
    SELECT * FROM packing_items
    WHERE trip_id = ?
    ORDER BY sort_order ASC, created_at ASC
  `).all(tripId) as any[];
}

function getReservations(tripId: number) {
  return db.prepare(`
    SELECT * FROM reservations
    WHERE trip_id = ?
    ORDER BY created_at ASC
  `).all(tripId) as any[];
}

/* ── formatters ───────────────────────────────────────────────────────── */

function toJSON(data: unknown, pretty = true) {
  return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
}

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function tripsToCSV(trips: any[]) {
  const headers = [
    'id', 'title', 'description', 'start_date', 'end_date', 'currency',
    'is_archived', 'day_count', 'place_count', 'owner_username', 'owner_email',
    'created_at', 'updated_at',
  ];
  const rows = trips.map(t => headers.map(h => escapeCSV(t[h])).join(','));
  return [headers.join(','), ...rows].join('\n');
}

function bundleTrip(trip: any, opts: {
  places?: boolean;
  days?: boolean;
  budget?: boolean;
  packing?: boolean;
  reservations?: boolean;
  members?: boolean;
}) {
  const bundle: Record<string, unknown> = { trip };

  if (opts.places) bundle.places = getPlaces(trip.id);
  if (opts.days) bundle.days = getDays(trip.id);
  if (opts.budget) bundle.budget_items = getBudgetItems(trip.id);
  if (opts.packing) bundle.packing_items = getPackingItems(trip.id);
  if (opts.reservations) bundle.reservations = getReservations(trip.id);
  if (opts.members) bundle.members = getMembers(trip.id);

  return bundle;
}

/* ── main ─────────────────────────────────────────────────────────────── */

async function main() {
  const flags = parseArgs();

  if (flags.help) {
    showUsage();
    process.exit(0);
  }

  const format = String(flags.format || 'json').toLowerCase() as 'json' | 'csv' | 'ics' | 'bundle';
  const tripId = flags['trip-id'] ? Number(flags['trip-id']) : undefined;
  const userId = flags['user-id'] ? Number(flags['user-id']) : undefined;
  const userEmail = flags['user-email'] ? String(flags['user-email']) : undefined;
  const output = flags.output ? String(flags.output) : undefined;
  const archived = !!flags.archived;
  const all = !!flags.all;

  const includeOpts = {
    places: !!flags['with-places'],
    days: !!flags['with-days'],
    budget: !!flags['with-budget'],
    packing: !!flags['with-packing'],
    reservations: !!flags['with-reservations'],
    members: !!flags['with-members'],
  };

  if (!tripId && !userId && !userEmail && !all) {
    console.error('Error: specify --trip-id, --user-id, --user-email, or --all');
    showUsage();
    process.exit(1);
  }

  const trips = getTrips({ tripId, userId, userEmail, archived, all });

  if (trips.length === 0) {
    console.error('No trips found matching the criteria.');
    process.exit(1);
  }

  let outputData = '';

  if (format === 'ics') {
    if (trips.length !== 1) {
      console.error('Error: ICS export requires exactly one trip. Use --trip-id.');
      process.exit(1);
    }
    const { ics } = exportICS(trips[0].id);
    outputData = ics;
  } else if (format === 'csv') {
    outputData = tripsToCSV(trips);
  } else if (format === 'bundle') {
    if (trips.length !== 1) {
      console.error('Error: bundle export requires exactly one trip. Use --trip-id.');
      process.exit(1);
    }
    // bundle includes everything by default
    outputData = toJSON(bundleTrip(trips[0], {
      places: true, days: true, budget: true,
      packing: true, reservations: true, members: true,
    }));
  } else {
    // json
    const hasIncludes = Object.values(includeOpts).some(Boolean);
    if (trips.length === 1 && hasIncludes) {
      outputData = toJSON(bundleTrip(trips[0], includeOpts));
    } else {
      outputData = toJSON(trips.length === 1 ? trips[0] : { trips });
    }
  }

  if (output) {
    fs.writeFileSync(output, outputData, 'utf-8');
    console.log(`Exported ${trips.length} trip(s) to ${output}`);
  } else {
    console.log(outputData);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
