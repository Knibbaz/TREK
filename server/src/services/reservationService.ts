import { db, canAccessTrip } from '../db/database';
import { Reservation } from '../types';
import fetch from 'node-fetch';

export function verifyTripAccess(tripId: string | number, userId: number) {
  return canAccessTrip(tripId, userId);
}

export function listReservations(tripId: string | number) {
  const reservations = db.prepare(`
    SELECT r.*, d.day_number, p.name as place_name, r.assignment_id,
      ap.place_id as accommodation_place_id, acc_p.name as accommodation_name
    FROM reservations r
    LEFT JOIN days d ON r.day_id = d.id
    LEFT JOIN places p ON r.place_id = p.id
    LEFT JOIN day_accommodations ap ON r.accommodation_id = ap.id
    LEFT JOIN places acc_p ON ap.place_id = acc_p.id
    WHERE r.trip_id = ?
    ORDER BY r.reservation_time ASC, r.created_at ASC
  `).all(tripId) as any[];

  // Attach per-day positions for multi-day reservations
  const dayPositions = db.prepare(`
    SELECT rdp.reservation_id, rdp.day_id, rdp.position
    FROM reservation_day_positions rdp
    JOIN reservations r ON rdp.reservation_id = r.id
    WHERE r.trip_id = ?
  `).all(tripId) as { reservation_id: number; day_id: number; position: number }[];

  const posMap = new Map<number, Record<number, number>>();
  for (const dp of dayPositions) {
    if (!posMap.has(dp.reservation_id)) posMap.set(dp.reservation_id, {});
    posMap.get(dp.reservation_id)![dp.day_id] = dp.position;
  }

  for (const r of reservations) {
    r.day_positions = posMap.get(r.id) || null;
  }

  return reservations;
}

export function getReservationWithJoins(id: string | number) {
  return db.prepare(`
    SELECT r.*, d.day_number, p.name as place_name, r.assignment_id,
      ap.place_id as accommodation_place_id, acc_p.name as accommodation_name
    FROM reservations r
    LEFT JOIN days d ON r.day_id = d.id
    LEFT JOIN places p ON r.place_id = p.id
    LEFT JOIN day_accommodations ap ON r.accommodation_id = ap.id
    LEFT JOIN places acc_p ON ap.place_id = acc_p.id
    WHERE r.id = ?
  `).get(id);
}

export function getFlightNumberType(flightNumber: string): 'IATA' | 'ICAO' | 'UNKNOWN' {
  if (!flightNumber) return 'UNKNOWN';

  // Verwijder spaties en zet alles naar hoofdletters (bijv " klm 1234 " -> "KLM1234")
  const cleanCode = flightNumber.trim().toUpperCase().replace(/\s+/g, '');

  // ICAO Regex: 3 letters, gevolgd door 1 tot 4 cijfers (en heel soms een optionele letter aan het eind)
  const icaoRegex = /^[A-Z]{3}\d{1,4}[A-Z]?$/;
  if (icaoRegex.test(cleanCode)) {
    return 'ICAO';
  }

  // IATA Regex: 2 alfanumerieke karakters, gevolgd door 1 tot 4 cijfers
  const iataRegex = /^[A-Z0-9]{2}\d{1,4}[A-Z]?$/;
  if (iataRegex.test(cleanCode)) {
    return 'IATA';
  }

  return 'UNKNOWN';
}

interface CreateAccommodation {
  place_id?: number;
  start_day_id?: number;
  end_day_id?: number;
  check_in?: string;
  check_out?: string;
  confirmation?: string;
}

interface CreateReservationData {
  title: string;
  reservation_time?: string;
  reservation_end_time?: string;
  location?: string;
  confirmation_number?: string;
  notes?: string;
  day_id?: number;
  place_id?: number;
  assignment_id?: number;
  status?: string;
  type?: string;
  accommodation_id?: number;
  metadata?: any;
  create_accommodation?: CreateAccommodation;
}

export async function createReservation(tripId: string | number, data: CreateReservationData): { reservation: any; accommodationCreated: boolean; flightCreated: boolean } {
  let { reservation_time, reservation_end_time, location } = data;
  
  const {
    title, confirmation_number, notes, day_id, place_id, assignment_id,
    status, type, accommodation_id, metadata, create_accommodation
  } = data;

  let accommodationCreated = false;

  // Auto-create accommodation for hotel reservations
  let resolvedAccommodationId: number | null = accommodation_id || null;
  if (type === 'hotel' && !resolvedAccommodationId && create_accommodation) {
    const { place_id: accPlaceId, start_day_id, end_day_id, check_in, check_out, confirmation: accConf } = create_accommodation;
    if (accPlaceId && start_day_id && end_day_id) {
      const accResult = db.prepare(
        'INSERT INTO day_accommodations (trip_id, place_id, start_day_id, end_day_id, check_in, check_out, confirmation) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(tripId, accPlaceId, start_day_id, end_day_id, check_in || null, check_out || null, accConf || confirmation_number || null);
      resolvedAccommodationId = Number(accResult.lastInsertRowid);
      accommodationCreated = true;
    }
  }

  let flightCreated = false;
  if (type === 'flight' && status === 'confirmed') {
    try {
      console.log('Fetching flight info for reservation with metadata:', metadata);

      const keys = Object.keys(metadata || {});

      // ERROR: If flight_number is missing
      // ERROR: If there are any keys present that are NOT in allowedKeys
      const allowedKeys = ['flight_number', 'price'];
      const hasExtraKeys = keys.some(key => !allowedKeys.includes(key));
      if (!keys.includes('flight_number') || hasExtraKeys) {
        console.log('Skipping flight info fetch due to missing flight_number or presence of extra keys in metadata');
      } else {


        const flight_number = metadata?.flight_number || '';
        const flightNumberType = getFlightNumberType(flight_number);

        if (flight_number && flightNumberType !== 'UNKNOWN') {
          // TODO: Move API key to env variable and secure it properly
          // const apiUrl = `https://api.aviationstack.com/v1/flights?access_key=${process.env.AVIATIONSTACK_KEY}&flight_iata=${flight_number}&limit=1`;
          const apiUrl = `http://api.aviationstack.com/v1/flights?access_key=cfb51540bcc0848d0b385a9049a81798&flight_${flightNumberType.toLowerCase()}=${flight_number}&limit=1`;
        
          const response = await fetch(apiUrl);
          const data = await response.json();

          if (data.data && data.data.length > 0) {
            const flightInfo = data.data[0];

            // TODO:
            // -> Handle location better - currently we just take the departure airport, like schiphol, but not the full address like how we look for it in the places.
            // -> Handle timezone properly - currently we just take the scheduled times as-is without converting to the trip's timezone
            location = flightInfo.departure.airport;
            reservation_time = flightInfo.departure.scheduled;
            reservation_end_time = flightInfo.arrival.scheduled;
            metadata.departure_airport = flightInfo.departure.iata;
            metadata.arrival_airport = flightInfo.arrival.iata;

            flightCreated = true;
          } else {
            console.warn(`No flight data found for flight number: ${flight_number}`);
          }
        }
      }
    } catch (err) {
      console.error('[reservations] Failed to fetch flight info:', err);
    }
  }

  const result = db.prepare(`
    INSERT INTO reservations (trip_id, day_id, place_id, assignment_id, title, reservation_time, reservation_end_time, location, confirmation_number, notes, status, type, accommodation_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    tripId,
    day_id || null,
    place_id || null,
    assignment_id || null,
    title,
    reservation_time || null,
    reservation_end_time || null,
    location || null,
    confirmation_number || null,
    notes || null,
    status || 'pending',
    type || 'other',
    resolvedAccommodationId,
    metadata ? JSON.stringify(metadata) : null
  );

  // Sync check-in/out to accommodation if linked
  if (accommodation_id && metadata) {
    const meta = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
    if (meta.check_in_time || meta.check_out_time) {
      db.prepare('UPDATE day_accommodations SET check_in = COALESCE(?, check_in), check_out = COALESCE(?, check_out) WHERE id = ?')
        .run(meta.check_in_time || null, meta.check_out_time || null, accommodation_id);
    }
    if (confirmation_number) {
      db.prepare('UPDATE day_accommodations SET confirmation = COALESCE(?, confirmation) WHERE id = ?')
        .run(confirmation_number, accommodation_id);
    }
  }

  const reservation = getReservationWithJoins(Number(result.lastInsertRowid));
  return { reservation, accommodationCreated, flightCreated };
}

export function updatePositions(tripId: string | number, positions: { id: number; day_plan_position: number }[], dayId?: number | string) {
  if (dayId) {
    // Per-day positions for multi-day reservations
    const stmt = db.prepare('INSERT OR REPLACE INTO reservation_day_positions (reservation_id, day_id, position) VALUES (?, ?, ?)');
    const updateMany = db.transaction((items: { id: number; day_plan_position: number }[]) => {
      for (const item of items) {
        stmt.run(item.id, dayId, item.day_plan_position);
      }
    });
    updateMany(positions);
  } else {
    // Legacy: update global position
    const stmt = db.prepare('UPDATE reservations SET day_plan_position = ? WHERE id = ? AND trip_id = ?');
    const updateMany = db.transaction((items: { id: number; day_plan_position: number }[]) => {
      for (const item of items) {
        stmt.run(item.day_plan_position, item.id, tripId);
      }
    });
    updateMany(positions);
  }
}

export function getDayPositions(tripId: string | number, dayId: number | string) {
  return db.prepare(`
    SELECT rdp.reservation_id, rdp.position
    FROM reservation_day_positions rdp
    JOIN reservations r ON rdp.reservation_id = r.id
    WHERE r.trip_id = ? AND rdp.day_id = ?
  `).all(tripId, dayId) as { reservation_id: number; position: number }[];
}

export function getReservation(id: string | number, tripId: string | number) {
  return db.prepare('SELECT * FROM reservations WHERE id = ? AND trip_id = ?').get(id, tripId) as Reservation | undefined;
}

interface UpdateReservationData {
  title?: string;
  reservation_time?: string;
  reservation_end_time?: string;
  location?: string;
  confirmation_number?: string;
  notes?: string;
  day_id?: number;
  place_id?: number;
  assignment_id?: number;
  status?: string;
  type?: string;
  accommodation_id?: number;
  metadata?: any;
  create_accommodation?: CreateAccommodation;
}

export function updateReservation(id: string | number, tripId: string | number, data: UpdateReservationData, current: Reservation): { reservation: any; accommodationChanged: boolean } {
  const {
    title, reservation_time, reservation_end_time, location,
    confirmation_number, notes, day_id, place_id, assignment_id,
    status, type, accommodation_id, metadata, create_accommodation
  } = data;

  let accommodationChanged = false;

  // Update or create accommodation for hotel reservations
  let resolvedAccId: number | null = accommodation_id !== undefined ? (accommodation_id || null) : (current.accommodation_id ?? null);
  if (type === 'hotel' && create_accommodation) {
    const { place_id: accPlaceId, start_day_id, end_day_id, check_in, check_out, confirmation: accConf } = create_accommodation;
    if (accPlaceId && start_day_id && end_day_id) {
      if (resolvedAccId) {
        db.prepare('UPDATE day_accommodations SET place_id = ?, start_day_id = ?, end_day_id = ?, check_in = ?, check_out = ?, confirmation = ? WHERE id = ?')
          .run(accPlaceId, start_day_id, end_day_id, check_in || null, check_out || null, accConf || confirmation_number || null, resolvedAccId);
      } else {
        const accResult = db.prepare(
          'INSERT INTO day_accommodations (trip_id, place_id, start_day_id, end_day_id, check_in, check_out, confirmation) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(tripId, accPlaceId, start_day_id, end_day_id, check_in || null, check_out || null, accConf || confirmation_number || null);
        resolvedAccId = Number(accResult.lastInsertRowid);
      }
      accommodationChanged = true;
    }
  }

  db.prepare(`
    UPDATE reservations SET
      title = COALESCE(?, title),
      reservation_time = ?,
      reservation_end_time = ?,
      location = ?,
      confirmation_number = ?,
      notes = ?,
      day_id = ?,
      place_id = ?,
      assignment_id = ?,
      status = COALESCE(?, status),
      type = COALESCE(?, type),
      accommodation_id = ?,
      metadata = ?
    WHERE id = ?
  `).run(
    title || null,
    (type ?? current.type) === 'hotel' ? null : (reservation_time !== undefined ? (reservation_time || null) : current.reservation_time),
    (type ?? current.type) === 'hotel' ? null : (reservation_end_time !== undefined ? (reservation_end_time || null) : current.reservation_end_time),
    location !== undefined ? (location || null) : current.location,
    confirmation_number !== undefined ? (confirmation_number || null) : current.confirmation_number,
    notes !== undefined ? (notes || null) : current.notes,
    day_id !== undefined ? (day_id || null) : current.day_id,
    place_id !== undefined ? (place_id || null) : current.place_id,
    assignment_id !== undefined ? (assignment_id || null) : current.assignment_id,
    status || null,
    type || null,
    resolvedAccId,
    metadata !== undefined ? (metadata ? JSON.stringify(metadata) : null) : current.metadata,
    id
  );

  // Sync check-in/out to accommodation if linked
  const resolvedMeta = metadata !== undefined ? metadata : (current.metadata ? JSON.parse(current.metadata as string) : null);
  if (resolvedAccId && resolvedMeta) {
    const meta = typeof resolvedMeta === 'string' ? JSON.parse(resolvedMeta) : resolvedMeta;
    if (meta.check_in_time || meta.check_out_time) {
      db.prepare('UPDATE day_accommodations SET check_in = COALESCE(?, check_in), check_out = COALESCE(?, check_out) WHERE id = ?')
        .run(meta.check_in_time || null, meta.check_out_time || null, resolvedAccId);
    }
    const resolvedConf = confirmation_number !== undefined ? confirmation_number : current.confirmation_number;
    if (resolvedConf) {
      db.prepare('UPDATE day_accommodations SET confirmation = COALESCE(?, confirmation) WHERE id = ?')
        .run(resolvedConf, resolvedAccId);
    }
  }

  const reservation = getReservationWithJoins(id);
  return { reservation, accommodationChanged };
}

export function deleteReservation(id: string | number, tripId: string | number): { deleted: { id: number; title: string; type: string; accommodation_id: number | null } | undefined; accommodationDeleted: boolean } {
  const reservation = db.prepare('SELECT id, title, type, accommodation_id FROM reservations WHERE id = ? AND trip_id = ?').get(id, tripId) as { id: number; title: string; type: string; accommodation_id: number | null } | undefined;
  if (!reservation) return { deleted: undefined, accommodationDeleted: false };

  let accommodationDeleted = false;
  if (reservation.accommodation_id) {
    db.prepare('DELETE FROM day_accommodations WHERE id = ?').run(reservation.accommodation_id);
    accommodationDeleted = true;
  }

  db.prepare('DELETE FROM reservations WHERE id = ?').run(id);
  return { deleted: reservation, accommodationDeleted };
}
