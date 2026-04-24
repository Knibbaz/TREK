import { db } from '../db/database';

export interface Group {
  id: number;
  name: string;
  description: string | null;
  cover_image: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface GroupMember {
  id: number;
  group_id: number;
  user_id: number;
  role: 'owner' | 'admin' | 'member';
  invited_by: number | null;
  joined_at: string;
  username?: string;
  avatar?: string | null;
}

export interface GroupTrip {
  id: number;
  group_id: number;
  trip_id: number;
  added_by: number;
  added_at: string;
  trip_title?: string;
  trip_cover_image?: string | null;
}

export interface GroupWithDetails extends Group {
  member_count: number;
  trip_count: number;
  role: 'owner' | 'admin' | 'member';
  members?: GroupMember[];
  trips?: GroupTrip[];
}

// ── List groups the user belongs to ─────────────────────────────────────────
export function listGroups(userId: number): GroupWithDetails[] {
  return db.prepare(`
    SELECT g.*, gm.role,
      (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count,
      (SELECT COUNT(*) FROM group_trips WHERE group_id = g.id) AS trip_count
    FROM groups g
    JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.user_id = ?
    ORDER BY g.updated_at DESC
  `).all(userId) as GroupWithDetails[];
}

// ── Get single group with members and trips ─────────────────────────────────
export function getGroup(userId: number, groupId: number): GroupWithDetails | null {
  const group = db.prepare(`
    SELECT g.*, gm.role,
      (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count,
      (SELECT COUNT(*) FROM group_trips WHERE group_id = g.id) AS trip_count
    FROM groups g
    JOIN group_members gm ON gm.group_id = g.id
    WHERE g.id = ? AND gm.user_id = ?
  `).get(groupId, userId) as GroupWithDetails | undefined;

  if (!group) return null;

  group.members = db.prepare(`
    SELECT gm.*, u.username, u.avatar
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY CASE gm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.username
  `).all(groupId) as GroupMember[];

  group.trips = db.prepare(`
    SELECT gt.*, t.title AS trip_title, t.cover_image AS trip_cover_image
    FROM group_trips gt
    JOIN trips t ON t.id = gt.trip_id
    WHERE gt.group_id = ?
    ORDER BY gt.added_at DESC
  `).all(groupId) as GroupTrip[];

  return group;
}

// ── Create a group ──────────────────────────────────────────────────────────
export function createGroup(userId: number, data: { name: string; description?: string; cover_image?: string }): GroupWithDetails {
  const stmt = db.prepare(`
    INSERT INTO groups (name, description, cover_image, created_by)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(data.name.trim(), data.description || null, data.cover_image || null, userId);
  const groupId = result.lastInsertRowid as number;

  db.prepare(`
    INSERT INTO group_members (group_id, user_id, role, invited_by)
    VALUES (?, ?, 'owner', ?)
  `).run(groupId, userId, userId);

  return getGroup(userId, groupId)!;
}

// ── Update a group ──────────────────────────────────────────────────────────
export function updateGroup(groupId: number, userId: number, data: { name?: string; description?: string | null; cover_image?: string | null }): GroupWithDetails | null {
  const member = db.prepare(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, userId) as { role: string } | undefined;
  if (!member || (member.role !== 'owner' && member.role !== 'admin')) return null;

  const fields: string[] = [];
  const values: any[] = [];

  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name.trim()); }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
  if (data.cover_image !== undefined) { fields.push('cover_image = ?'); values.push(data.cover_image); }

  if (fields.length === 0) return getGroup(userId, groupId);

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(groupId);

  db.prepare(`UPDATE groups SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getGroup(userId, groupId);
}

// ── Delete a group ──────────────────────────────────────────────────────────
export function deleteGroup(groupId: number, userId: number): boolean {
  const member = db.prepare(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, userId) as { role: string } | undefined;
  if (!member || member.role !== 'owner') return false;

  db.prepare(`DELETE FROM groups WHERE id = ?`).run(groupId);
  return true;
}

// ── Add member to group ─────────────────────────────────────────────────────
export function addMemberToGroup(groupId: number, userId: number, addedBy: number, role: 'admin' | 'member' = 'member'): { success: boolean; error?: string } {
  const inviter = db.prepare(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, addedBy) as { role: string } | undefined;
  if (!inviter || (inviter.role !== 'owner' && inviter.role !== 'admin')) {
    return { success: false, error: 'Forbidden' };
  }

  const existing = db.prepare(`SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, userId);
  if (existing) return { success: false, error: 'User already in group' };

  const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(userId);
  if (!user) return { success: false, error: 'User not found' };

  db.prepare(`INSERT INTO group_members (group_id, user_id, role, invited_by) VALUES (?, ?, ?, ?)`)
    .run(groupId, userId, role, addedBy);

  return { success: true };
}

// ── Remove member from group ────────────────────────────────────────────────
export function removeMemberFromGroup(groupId: number, memberUserId: number, actingUserId: number): { success: boolean; error?: string } {
  const actor = db.prepare(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, actingUserId) as { role: string } | undefined;
  if (!actor) return { success: false, error: 'Forbidden' };

  const target = db.prepare(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, memberUserId) as { role: string } | undefined;
  if (!target) return { success: false, error: 'Member not found' };

  // Owner can remove anyone; admin can remove members but not other admins or owner
  if (actor.role === 'owner') {
    // ok
  } else if (actor.role === 'admin') {
    if (target.role === 'owner' || target.role === 'admin') {
      return { success: false, error: 'Admins cannot remove owners or other admins' };
    }
  } else {
    return { success: false, error: 'Forbidden' };
  }

  // Prevent removing the last owner
  if (target.role === 'owner') {
    const ownerCount = db.prepare(`SELECT COUNT(*) AS c FROM group_members WHERE group_id = ? AND role = 'owner'`).get(groupId) as { c: number };
    if (ownerCount.c <= 1) return { success: false, error: 'Cannot remove the last owner' };
  }

  db.prepare(`DELETE FROM group_members WHERE group_id = ? AND user_id = ?`).run(groupId, memberUserId);
  return { success: true };
}

// ── Update member role ──────────────────────────────────────────────────────
export function updateMemberRole(groupId: number, memberUserId: number, actingUserId: number, newRole: 'admin' | 'member'): { success: boolean; error?: string } {
  const actor = db.prepare(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, actingUserId) as { role: string } | undefined;
  if (!actor || actor.role !== 'owner') return { success: false, error: 'Only owners can change roles' };

  const target = db.prepare(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, memberUserId) as { role: string } | undefined;
  if (!target) return { success: false, error: 'Member not found' };

  if (target.role === 'owner') {
    const ownerCount = db.prepare(`SELECT COUNT(*) AS c FROM group_members WHERE group_id = ? AND role = 'owner'`).get(groupId) as { c: number };
    if (ownerCount.c <= 1) return { success: false, error: 'Cannot demote the last owner' };
  }

  db.prepare(`UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?`).run(newRole, groupId, memberUserId);
  return { success: true };
}

// ── Add trip to group ───────────────────────────────────────────────────────
export function addTripToGroup(groupId: number, tripId: number, userId: number): { success: boolean; error?: string } {
  const member = db.prepare(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, userId) as { role: string } | undefined;
  if (!member) return { success: false, error: 'Forbidden' };

  const trip = db.prepare(`SELECT id FROM trips WHERE id = ?`).get(tripId);
  if (!trip) return { success: false, error: 'Trip not found' };

  try {
    db.prepare(`INSERT INTO group_trips (group_id, trip_id, added_by) VALUES (?, ?, ?)`).run(groupId, tripId, userId);
  } catch (e: any) {
    if (e.message?.includes('UNIQUE constraint failed')) return { success: false, error: 'Trip already in group' };
    throw e;
  }

  return { success: true };
}

// ── Remove trip from group ──────────────────────────────────────────────────
export function removeTripFromGroup(groupId: number, tripId: number, userId: number): { success: boolean; error?: string } {
  const member = db.prepare(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, userId) as { role: string } | undefined;
  if (!member) return { success: false, error: 'Forbidden' };

  db.prepare(`DELETE FROM group_trips WHERE group_id = ? AND trip_id = ?`).run(groupId, tripId);
  return { success: true };
}

// ── Search users to invite ──────────────────────────────────────────────────
export function searchUsersForInvite(userId: number, query: string): Array<{ id: number; username: string; email: string; avatar: string | null }> {
  const search = `%${query.trim().toLowerCase()}%`;
  return db.prepare(`
    SELECT id, username, email, avatar
    FROM users
    WHERE id != ? AND (LOWER(username) LIKE ? OR LOWER(email) LIKE ?)
    ORDER BY username
    LIMIT 20
  `).all(userId, search, search) as Array<{ id: number; username: string; email: string; avatar: string | null }>;
}
