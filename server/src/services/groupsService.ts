import { db } from '../db/database';
import crypto from 'crypto';

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

  // Grant access to all group trips
  syncUserToGroupTrips(groupId, userId);

  return { success: true };
}

// ── Remove member from group ────────────────────────────────────────────────
export function removeMemberFromGroup(groupId: number, memberUserId: number, actingUserId: number): { success: boolean; error?: string } {
  const actor = db.prepare(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, actingUserId) as { role: string } | undefined;
  if (!actor) return { success: false, error: 'Forbidden' };

  const target = db.prepare(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, memberUserId) as { role: string } | undefined;
  if (!target) return { success: false, error: 'Member not found' };

  // Any member can remove themselves (leave the group)
  const isSelf = actingUserId === memberUserId;

  // Owner can remove anyone; admin can remove members but not other admins or owner; members can only remove themselves
  if (actor.role === 'owner') {
    // ok
  } else if (actor.role === 'admin') {
    if (!isSelf && (target.role === 'owner' || target.role === 'admin')) {
      return { success: false, error: 'Admins cannot remove owners or other admins' };
    }
  } else if (isSelf) {
    // Regular member leaving — allowed
  } else {
    return { success: false, error: 'Forbidden' };
  }

  // Prevent removing the last owner
  if (target.role === 'owner') {
    const ownerCount = db.prepare(`SELECT COUNT(*) AS c FROM group_members WHERE group_id = ? AND role = 'owner'`).get(groupId) as { c: number };
    if (ownerCount.c <= 1) return { success: false, error: 'Cannot remove the last owner' };
  }

  db.prepare(`DELETE FROM group_members WHERE group_id = ? AND user_id = ?`).run(groupId, memberUserId);

  // Revoke access to all group trips
  removeUserFromGroupTrips(groupId, memberUserId);

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

// ── Trip sharing helpers ────────────────────────────────────────────────────

/** Grant all existing group members access to a trip (except the trip owner who already has access). */
function syncGroupMembersToTrip(groupId: number, tripId: number): void {
  const tripOwner = db.prepare('SELECT user_id FROM trips WHERE id = ?').get(tripId) as { user_id: number } | undefined;
  const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(groupId) as Array<{ user_id: number }>;
  const insert = db.prepare('INSERT OR IGNORE INTO trip_members (trip_id, user_id, invited_by) VALUES (?, ?, ?)');
  for (const m of members) {
    if (m.user_id !== tripOwner?.user_id) {
      insert.run(tripId, m.user_id, tripOwner?.user_id || null);
    }
  }
}

/** Grant a specific user access to all trips in a group. */
function syncUserToGroupTrips(groupId: number, userId: number): void {
  const trips = db.prepare('SELECT trip_id FROM group_trips WHERE group_id = ?').all(groupId) as Array<{ trip_id: number }>;
  const insert = db.prepare('INSERT OR IGNORE INTO trip_members (trip_id, user_id, invited_by) VALUES (?, ?, ?)');
  for (const t of trips) {
    const owner = db.prepare('SELECT user_id FROM trips WHERE id = ?').get(t.trip_id) as { user_id: number } | undefined;
    if (userId !== owner?.user_id) {
      insert.run(t.trip_id, userId, owner?.user_id || null);
    }
  }
}

/** Revoke a specific user's access to all trips in a group. */
function removeUserFromGroupTrips(groupId: number, userId: number): void {
  const trips = db.prepare('SELECT trip_id FROM group_trips WHERE group_id = ?').all(groupId) as Array<{ trip_id: number }>;
  for (const t of trips) {
    db.prepare('DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?').run(t.trip_id, userId);
  }
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

  // Share trip with all existing group members
  syncGroupMembersToTrip(groupId, tripId);

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

// ── Invite tokens ───────────────────────────────────────────────────────────

export interface GroupInviteToken {
  id: number;
  group_id: number;
  token: string;
  created_by: number;
  role: 'admin' | 'member';
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  created_at: string;
}

export function createGroupInviteLink(
  groupId: number,
  createdBy: number,
  role: 'admin' | 'member' = 'member',
  maxUses: number = 0,
  expiresInDays?: number
): { token: string; expires_at: string | null } | null {
  // Only owner/admin can create invite links
  const member = db.prepare(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, createdBy) as { role: string } | undefined;
  if (!member || (member.role !== 'owner' && member.role !== 'admin')) return null;

  // Revoke any existing link for this group
  db.prepare(`DELETE FROM group_invite_tokens WHERE group_id = ?`).run(groupId);

  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() : null;

  db.prepare(`
    INSERT INTO group_invite_tokens (group_id, token, created_by, role, max_uses, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(groupId, token, createdBy, role, maxUses, expiresAt);

  return { token, expires_at: expiresAt };
}

export function getGroupInviteLink(groupId: number, userId: number): { token: string; role: string; max_uses: number; used_count: number; expires_at: string | null } | null {
  const member = db.prepare(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, userId) as { role: string } | undefined;
  if (!member || (member.role !== 'owner' && member.role !== 'admin')) return null;

  const row = db.prepare(`
    SELECT token, role, max_uses, used_count, expires_at
    FROM group_invite_tokens
    WHERE group_id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).get(groupId) as GroupInviteToken | undefined;

  if (!row) return null;
  if (row.max_uses > 0 && row.used_count >= row.max_uses) return null;
  return row;
}

export function deleteGroupInviteLink(groupId: number, userId: number): boolean {
  const member = db.prepare(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, userId) as { role: string } | undefined;
  if (!member || (member.role !== 'owner' && member.role !== 'admin')) return false;

  db.prepare(`DELETE FROM group_invite_tokens WHERE group_id = ?`).run(groupId);
  return true;
}

export function validateGroupInviteToken(token: string): { groupId: number; name: string; description: string | null; cover_image: string | null; role: string } | null {
  const row = db.prepare(`
    SELECT git.*, g.name, g.description, g.cover_image
    FROM group_invite_tokens git
    JOIN groups g ON g.id = git.group_id
    WHERE git.token = ? AND (git.expires_at IS NULL OR git.expires_at > datetime('now'))
  `).get(token) as (GroupInviteToken & { name: string; description: string | null; cover_image: string | null }) | undefined;

  if (!row) return null;
  if (row.max_uses > 0 && row.used_count >= row.max_uses) return null;

  return {
    groupId: row.group_id,
    name: row.name,
    description: row.description,
    cover_image: row.cover_image,
    role: row.role,
  };
}

export function joinGroupWithToken(userId: number, token: string): { success: boolean; groupId?: number; error?: string; status?: number } {
  const invite = db.prepare(`
    SELECT git.*, g.name
    FROM group_invite_tokens git
    JOIN groups g ON g.id = git.group_id
    WHERE git.token = ? AND (git.expires_at IS NULL OR git.expires_at > datetime('now'))
  `).get(token) as (GroupInviteToken & { name: string }) | undefined;

  if (!invite) return { success: false, error: 'Invalid or expired invite link', status: 400 };
  if (invite.max_uses > 0 && invite.used_count >= invite.max_uses) return { success: false, error: 'Invite link fully used', status: 410 };

  // Check if already member
  const existing = db.prepare(`SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?`).get(invite.group_id, userId);
  if (existing) return { success: false, error: 'You are already a member of this group', status: 409 };

  // Add member
  db.prepare(`INSERT INTO group_members (group_id, user_id, role, invited_by) VALUES (?, ?, ?, ?)`)
    .run(invite.group_id, userId, invite.role, invite.created_by);

  // Grant access to all group trips
  syncUserToGroupTrips(invite.group_id, userId);

  // Increment used_count
  db.prepare(`UPDATE group_invite_tokens SET used_count = used_count + 1 WHERE id = ? AND (max_uses = 0 OR used_count < max_uses)`).run(invite.id);

  return { success: true, groupId: invite.group_id };
}

// ── Poll management: only 1 open poll per group ─────────────────────────────
export function createGroupPoll(
  tripId: string,
  createdBy: number,
  data: { title: string; description?: string; type?: string; anonymous?: boolean; deadline?: string; allow_guest_votes?: boolean }
): { success: boolean; pollId?: string; error?: string } {
  // Get trip and its groups
  const trip = db.prepare('SELECT id FROM trips WHERE id = ?').get(tripId) as { id: string } | undefined;
  if (!trip) return { success: false, error: 'Trip not found' };

  // Get group(s) for this trip
  const groups = db.prepare(`
    SELECT DISTINCT gt.group_id FROM group_trips gt WHERE gt.trip_id = ?
  `).all(tripId) as { group_id: number }[];

  if (groups.length === 0) return { success: false, error: 'Trip not shared with any group' };

  const groupId = groups[0].group_id; // Assuming 1 group per trip for now

  // Check if user is member of the group
  const isMember = db.prepare(`SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, createdBy);
  if (!isMember) return { success: false, error: 'Forbidden' };

  // Check if there's already an open poll for this trip
  const openPoll = db.prepare(`
    SELECT id FROM group_polls WHERE trip_id = ? AND status = 'open'
  `).get(tripId) as { id: string } | undefined;

  if (openPoll) {
    return { success: false, error: 'There is already an open poll for this trip. Only 1 open poll per group is allowed.' };
  }

  // Create the new poll
  const pollId = require('crypto').randomBytes(12).toString('hex');
  db.prepare(`
    INSERT INTO group_polls (id, trip_id, created_by, title, description, type, anonymous, deadline, allow_guest_votes, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', datetime('now'), datetime('now'))
  `).run(
    pollId,
    tripId,
    createdBy,
    data.title,
    data.description || null,
    data.type || 'single_choice',
    data.anonymous ? 1 : 0,
    data.deadline || null,
    data.allow_guest_votes !== false ? 1 : 0
  );

  return { success: true, pollId };
}
