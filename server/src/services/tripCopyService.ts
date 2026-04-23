import Database from 'better-sqlite3';

/**
 * Copies a full trip (days, places, assignments, accommodations, reservations,
 * budget items, packing, day notes) into a new trip owned by targetUserId.
 * Returns the new trip ID.
 */
export function copyTripTransaction(
  db: Database.Database,
  sourceTripId: number | string,
  targetUserId: number,
  title?: string
): number | bigint {
  const src = db.prepare('SELECT * FROM trips WHERE id = ?').get(sourceTripId) as any;
  if (!src) throw new Error('Source trip not found');

  const finalTitle = title || src.title;

  return db.transaction(() => {
    // 1. Create new trip
    const tripResult = db.prepare(`
      INSERT INTO trips (user_id, title, description, start_date, end_date, currency, cover_image, is_archived, reminder_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(targetUserId, finalTitle, src.description, src.start_date, src.end_date, src.currency, src.cover_image, src.reminder_days ?? 3);
    const newTripId = tripResult.lastInsertRowid;

    // 2. Copy days → build ID map
    const oldDays = db.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number').all(sourceTripId) as any[];
    const dayMap = new Map<number, number | bigint>();
    const insertDay = db.prepare('INSERT INTO days (trip_id, day_number, date, notes, title) VALUES (?, ?, ?, ?, ?)');
    for (const d of oldDays) {
      const r = insertDay.run(newTripId, d.day_number, d.date, d.notes, d.title);
      dayMap.set(d.id, r.lastInsertRowid);
    }

    // 3. Copy places → build ID map (exclude community contributions)
    const oldPlaces = db.prepare("SELECT * FROM places WHERE trip_id = ? AND (source IS NULL OR source = 'admin')").all(sourceTripId) as any[];
    const placeMap = new Map<number, number | bigint>();
    const insertPlace = db.prepare(`
      INSERT INTO places (trip_id, name, description, lat, lng, address, category_id, price, currency,
        reservation_status, reservation_notes, reservation_datetime, place_time, end_time,
        duration_minutes, notes, image_url, google_place_id, website, phone, transport_mode, osm_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of oldPlaces) {
      const r = insertPlace.run(newTripId, p.name, p.description, p.lat, p.lng, p.address, p.category_id,
        p.price, p.currency, p.reservation_status, p.reservation_notes, p.reservation_datetime,
        p.place_time, p.end_time, p.duration_minutes, p.notes, p.image_url, p.google_place_id,
        p.website, p.phone, p.transport_mode, p.osm_id);
      placeMap.set(p.id, r.lastInsertRowid);
    }

    // 4. Copy place_tags
    const oldTags = db.prepare(`
      SELECT pt.* FROM place_tags pt JOIN places p ON p.id = pt.place_id WHERE p.trip_id = ?
    `).all(sourceTripId) as any[];
    const insertTag = db.prepare('INSERT OR IGNORE INTO place_tags (place_id, tag_id) VALUES (?, ?)');
    for (const t of oldTags) {
      const newPlaceId = placeMap.get(t.place_id);
      if (newPlaceId) insertTag.run(newPlaceId, t.tag_id);
    }

    // 5. Copy day_assignments → build ID map
    const oldAssignments = db.prepare(`
      SELECT da.* FROM day_assignments da JOIN days d ON d.id = da.day_id WHERE d.trip_id = ?
    `).all(sourceTripId) as any[];
    const assignmentMap = new Map<number, number | bigint>();
    const insertAssignment = db.prepare(`
      INSERT INTO day_assignments (day_id, place_id, order_index, notes, reservation_status, reservation_notes, reservation_datetime, assignment_time, assignment_end_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const a of oldAssignments) {
      const newDayId = dayMap.get(a.day_id);
      const newPlaceId = placeMap.get(a.place_id);
      if (newDayId && newPlaceId) {
        const r = insertAssignment.run(newDayId, newPlaceId, a.order_index, a.notes,
          a.reservation_status, a.reservation_notes, a.reservation_datetime,
          a.assignment_time, a.assignment_end_time);
        assignmentMap.set(a.id, r.lastInsertRowid);
      }
    }

    // 6. Copy day_accommodations → build ID map
    const oldAccom = db.prepare('SELECT * FROM day_accommodations WHERE trip_id = ?').all(sourceTripId) as any[];
    const accomMap = new Map<number, number | bigint>();
    const insertAccom = db.prepare(`
      INSERT INTO day_accommodations (trip_id, place_id, start_day_id, end_day_id, check_in, check_out, confirmation, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const a of oldAccom) {
      const newPlaceId = placeMap.get(a.place_id);
      const newStartDay = dayMap.get(a.start_day_id);
      const newEndDay = dayMap.get(a.end_day_id);
      if (newPlaceId && newStartDay && newEndDay) {
        const r = insertAccom.run(newTripId, newPlaceId, newStartDay, newEndDay, a.check_in, a.check_out, a.confirmation, a.notes);
        accomMap.set(a.id, r.lastInsertRowid);
      }
    }

    // 7. Copy reservations
    const oldReservations = db.prepare('SELECT * FROM reservations WHERE trip_id = ?').all(sourceTripId) as any[];
    const insertReservation = db.prepare(`
      INSERT INTO reservations (trip_id, day_id, place_id, assignment_id, accommodation_id, title, reservation_time, reservation_end_time,
        location, confirmation_number, notes, status, type, metadata, day_plan_position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of oldReservations) {
      insertReservation.run(newTripId,
        r.day_id ? (dayMap.get(r.day_id) ?? null) : null,
        r.place_id ? (placeMap.get(r.place_id) ?? null) : null,
        r.assignment_id ? (assignmentMap.get(r.assignment_id) ?? null) : null,
        r.accommodation_id ? (accomMap.get(r.accommodation_id) ?? null) : null,
        r.title, r.reservation_time, r.reservation_end_time,
        r.location, r.confirmation_number, r.notes, r.status, r.type,
        r.metadata, r.day_plan_position);
    }

    // 8. Copy budget_items (paid_by_user_id reset to null)
    const oldBudget = db.prepare('SELECT * FROM budget_items WHERE trip_id = ?').all(sourceTripId) as any[];
    const insertBudget = db.prepare(`
      INSERT INTO budget_items (trip_id, category, name, total_price, persons, days, note, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const b of oldBudget) {
      insertBudget.run(newTripId, b.category, b.name, b.total_price, b.persons, b.days, b.note, b.sort_order);
    }

    // 9. Copy packing_bags → build ID map
    const oldBags = db.prepare('SELECT * FROM packing_bags WHERE trip_id = ?').all(sourceTripId) as any[];
    const bagMap = new Map<number, number | bigint>();
    const insertBag = db.prepare(`
      INSERT INTO packing_bags (trip_id, name, color, weight_limit_grams, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const bag of oldBags) {
      const r = insertBag.run(newTripId, bag.name, bag.color, bag.weight_limit_grams, bag.sort_order);
      bagMap.set(bag.id, r.lastInsertRowid);
    }

    // 10. Copy packing_items (checked reset to 0)
    const oldPacking = db.prepare('SELECT * FROM packing_items WHERE trip_id = ?').all(sourceTripId) as any[];
    const insertPacking = db.prepare(`
      INSERT INTO packing_items (trip_id, name, checked, category, sort_order, weight_grams, bag_id)
      VALUES (?, ?, 0, ?, ?, ?, ?)
    `);
    for (const p of oldPacking) {
      insertPacking.run(newTripId, p.name, p.category, p.sort_order, p.weight_grams,
        p.bag_id ? (bagMap.get(p.bag_id) ?? null) : null);
    }

    // 11. Copy day_notes
    const oldNotes = db.prepare('SELECT * FROM day_notes WHERE trip_id = ?').all(sourceTripId) as any[];
    const insertNote = db.prepare(`
      INSERT INTO day_notes (day_id, trip_id, text, time, icon, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const n of oldNotes) {
      const newDayId = dayMap.get(n.day_id);
      if (newDayId) insertNote.run(newDayId, newTripId, n.text, n.time, n.icon, n.sort_order);
    }

    return newTripId;
  })();
}

/**
 * Auto-merge: adds new days and places from the source trip into the user's trip.
 * Purely additive — existing user content is never modified or deleted.
 * Returns counts of what was added.
 */
export function mergeTripFromSource(
  db: Database.Database,
  sourceTripId: number | string,
  userTripId: number | string
): { added_days: number; added_places: number } {
  return db.transaction(() => {
    // Existing day_numbers in user trip
    const existingDayNumbers = new Set<number>(
      (db.prepare('SELECT day_number FROM days WHERE trip_id = ?').all(userTripId) as any[]).map((d: any) => d.day_number)
    );

    // Existing places as "name|lat|lng" keys
    const existingPlaceKeys = new Set<string>(
      (db.prepare('SELECT name, lat, lng FROM places WHERE trip_id = ?').all(userTripId) as any[]).map(
        (p: any) => `${p.name}|${p.lat}|${p.lng}`
      )
    );

    // Map: user's day_number → user's day_id (for assigning new places to existing days)
    const userDayByNumber = new Map<number, number>(
      (db.prepare('SELECT id, day_number FROM days WHERE trip_id = ?').all(userTripId) as any[]).map(
        (d: any) => [d.day_number, d.id]
      )
    );

    const sourceDays = db.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number').all(sourceTripId) as any[];
    const sourcePlaces = db.prepare('SELECT * FROM places WHERE trip_id = ?').all(sourceTripId) as any[];
    const sourceAssignments = db.prepare(`
      SELECT da.*, d.day_number FROM day_assignments da
      JOIN days d ON d.id = da.day_id
      WHERE d.trip_id = ?
    `).all(sourceTripId) as any[];

    const dayMap = new Map<number, number | bigint>(); // sourceDay.id → newDayId
    const placeMap = new Map<number, number | bigint>(); // sourcePlace.id → newPlaceId

    // Add new days
    const insertDay = db.prepare('INSERT INTO days (trip_id, day_number, date, notes, title) VALUES (?, ?, ?, ?, ?)');
    for (const d of sourceDays) {
      if (!existingDayNumbers.has(d.day_number)) {
        const r = insertDay.run(userTripId, d.day_number, d.date, d.notes, d.title);
        dayMap.set(d.id, r.lastInsertRowid);
        userDayByNumber.set(d.day_number, Number(r.lastInsertRowid));
      }
    }

    // Add new places
    const insertPlace = db.prepare(`
      INSERT INTO places (trip_id, name, description, lat, lng, address, category_id, price, currency,
        reservation_status, reservation_notes, reservation_datetime, place_time, end_time,
        duration_minutes, notes, image_url, google_place_id, website, phone, transport_mode, osm_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertTag = db.prepare('INSERT OR IGNORE INTO place_tags (place_id, tag_id) VALUES (?, ?)');
    for (const p of sourcePlaces) {
      const key = `${p.name}|${p.lat}|${p.lng}`;
      if (!existingPlaceKeys.has(key)) {
        const r = insertPlace.run(userTripId, p.name, p.description, p.lat, p.lng, p.address, p.category_id,
          p.price, p.currency, p.reservation_status, p.reservation_notes, p.reservation_datetime,
          p.place_time, p.end_time, p.duration_minutes, p.notes, p.image_url, p.google_place_id,
          p.website, p.phone, p.transport_mode, p.osm_id);
        placeMap.set(p.id, r.lastInsertRowid);

        // Copy tags for new place
        const tags = db.prepare('SELECT tag_id FROM place_tags WHERE place_id = ?').all(p.id) as any[];
        for (const t of tags) insertTag.run(r.lastInsertRowid, t.tag_id);
      }
    }

    // Add assignments for new content (new day OR new place)
    const insertAssignment = db.prepare(`
      INSERT OR IGNORE INTO day_assignments (day_id, place_id, order_index, notes, reservation_status, reservation_notes, reservation_datetime, assignment_time, assignment_end_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const a of sourceAssignments) {
      const newDayId = dayMap.get(a.day_id) ?? userDayByNumber.get(a.day_number);
      const newPlaceId = placeMap.get(a.place_id);
      // Only create assignment if at least one side is new
      if (newDayId && newPlaceId) {
        insertAssignment.run(newDayId, newPlaceId, a.order_index, a.notes,
          a.reservation_status, a.reservation_notes, a.reservation_datetime,
          a.assignment_time, a.assignment_end_time);
      }
    }

    return { added_days: dayMap.size, added_places: placeMap.size };
  })();
}
