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

// ── Leave group with optional admin reassignment ──────────────────────────────
export function leaveGroupWithReassignment(groupId: number, userId: number, newAdminId?: number): { success: boolean; error?: string } {
  const member = db.prepare(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, userId) as { role: string } | undefined;
  if (!member) return { success: false, error: 'Member not found' };

  // If leaving admin, require reassignment
  if (member.role === 'admin' && newAdminId) {
    const newAdmin = db.prepare(`SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`).get(groupId, newAdminId) as { role: string } | undefined;
    if (!newAdmin) return { success: false, error: 'New admin not found' };

    // Promote new admin
    db.prepare(`UPDATE group_members SET role = 'admin' WHERE group_id = ? AND user_id = ?`).run(groupId, newAdminId);
  }

  // Remove self
  db.prepare(`DELETE FROM group_members WHERE group_id = ? AND user_id = ?`).run(groupId, userId);
  removeUserFromGroupTrips(groupId, userId);

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

// ── Poll listing & details ───────────────────────────────────────────────────
export function listGroupPolls(tripId: string, userId: number): Record<string, unknown>[] {
  const hasTripAccess = db.prepare(`
    SELECT 1 FROM trips WHERE id = ? AND user_id = ?
    UNION SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?
  `).get(tripId, userId, tripId, userId);
  if (!hasTripAccess) return [];

  const polls = db.prepare(`
    SELECT p.*, u.username AS creator_name,
      (SELECT COUNT(*) FROM group_poll_votes WHERE poll_id = p.id) AS total_votes,
      (SELECT COUNT(DISTINCT COALESCE(user_id, guest_token)) FROM group_poll_votes WHERE poll_id = p.id) AS voter_count
    FROM group_polls p
    LEFT JOIN users u ON u.id = p.created_by
    WHERE p.trip_id = ?
    ORDER BY p.created_at DESC
  `).all(tripId) as Record<string, unknown>[];

  for (const poll of polls) {
    attachPollDetails(poll, userId);
  }

  return polls;
}

export function getGroupPoll(pollId: string, userId: number): Record<string, unknown> | null {
  const poll = db.prepare(`
    SELECT p.*, u.username AS creator_name
    FROM group_polls p
    LEFT JOIN users u ON u.id = p.created_by
    WHERE p.id = ?
  `).get(pollId) as Record<string, unknown> | undefined;

  if (!poll) return null;

  const hasTripAccess = db.prepare(`
    SELECT 1 FROM trips WHERE id = ? AND user_id = ?
    UNION SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?
  `).get(poll.trip_id, userId, poll.trip_id, userId);
  if (!hasTripAccess) return null;

  attachPollDetails(poll, userId);
  return poll;
}

// ── Shared helper: attach options + votes to a poll object ───────────────────
function attachPollDetails(poll: Record<string, unknown>, userId: number): void {
  const pollId = poll.id as string;
  const pollType = poll.type as string;
  const isAnonymous = poll.anonymous as number;

  const options = db.prepare(`
    SELECT o.*,
      COUNT(v.id) AS vote_count
    FROM group_poll_options o
    LEFT JOIN group_poll_votes v ON v.option_id = o.id AND v.poll_id = o.poll_id
    WHERE o.poll_id = ?
    GROUP BY o.id
    ORDER BY o.sort_order, o.created_at
  `).all(pollId) as Record<string, unknown>[];

  if (pollType === 'ranked') {
    // Borda count: for N options, rank 1 = N pts, rank 2 = N-1 pts, etc.
    const n = options.length;
    const bordaMap: Record<string, number> = {};
    const rankVotes = db.prepare(`
      SELECT option_id, rank FROM group_poll_votes WHERE poll_id = ? AND rank IS NOT NULL
    `).all(pollId) as Array<{ option_id: string; rank: number }>;

    for (const v of rankVotes) {
      const score = Math.max(0, n - v.rank + 1);
      bordaMap[v.option_id] = (bordaMap[v.option_id] || 0) + score;
    }
    for (const o of options) {
      o.borda_score = bordaMap[o.id as string] || 0;
    }
    options.sort((a, b) => (b.borda_score as number) - (a.borda_score as number));

    // User's own ranking
    const myRanks = db.prepare(`
      SELECT option_id, rank FROM group_poll_votes WHERE poll_id = ? AND user_id = ? AND rank IS NOT NULL
      ORDER BY rank
    `).all(pollId, userId) as Array<{ option_id: string; rank: number }>;
    poll.my_ranks = myRanks;

  } else if (pollType === 'swipe') {
    // Swipe: match score = superlike=2, like=1, dislike=0
    const swipeMap: Record<string, { like: number; superlike: number; dislike: number }> = {};
    const swipeVotes = db.prepare(`
      SELECT option_id, swipe_value FROM group_poll_votes WHERE poll_id = ? AND swipe_value IS NOT NULL
    `).all(pollId) as Array<{ option_id: string; swipe_value: string }>;

    for (const v of swipeVotes) {
      if (!swipeMap[v.option_id]) swipeMap[v.option_id] = { like: 0, superlike: 0, dislike: 0 };
      if (v.swipe_value === 'like') swipeMap[v.option_id].like++;
      else if (v.swipe_value === 'superlike') swipeMap[v.option_id].superlike++;
      else if (v.swipe_value === 'dislike') swipeMap[v.option_id].dislike++;
    }
    for (const o of options) {
      const s = swipeMap[o.id as string] || { like: 0, superlike: 0, dislike: 0 };
      o.swipe_stats = s;
      o.match_score = s.superlike * 2 + s.like;
    }

    // User's own swipe values
    const mySwipes = db.prepare(`
      SELECT option_id, swipe_value FROM group_poll_votes WHERE poll_id = ? AND user_id = ? AND swipe_value IS NOT NULL
    `).all(pollId, userId) as Array<{ option_id: string; swipe_value: string }>;
    poll.my_swipes = Object.fromEntries(mySwipes.map(v => [v.option_id, v.swipe_value]));

  } else {
    // single_choice / multi_choice: user_voted flag
    for (const o of options) {
      const voted = db.prepare(
        'SELECT 1 FROM group_poll_votes WHERE poll_id = ? AND option_id = ? AND user_id = ?'
      ).get(pollId, o.id, userId);
      o.user_voted = voted ? 1 : 0;
    }
  }

  poll.options = options;

  // my_votes: array of voted option_ids (works for all types except ranked/swipe)
  if (pollType !== 'ranked' && pollType !== 'swipe') {
    const myVotes = db.prepare(
      'SELECT option_id FROM group_poll_votes WHERE poll_id = ? AND user_id = ?'
    ).all(pollId, userId) as Array<{ option_id: string }>;
    poll.my_votes = myVotes.map(v => v.option_id);
    // Backward compat: single string
    poll.my_vote = myVotes[0]?.option_id || null;
  }

  // If anonymous: strip individual voter info from non-owners
  if (isAnonymous) {
    for (const o of options) {
      delete o.user_voted;
    }
  }
}

// ── Poll option management ───────────────────────────────────────────────────
export function addPollOption(
  pollId: string,
  userId: number,
  data: { label: string; description?: string; lat?: number; lng?: number; image_url?: string }
): { success: boolean; option?: Record<string, unknown>; error?: string } {
  const poll = db.prepare('SELECT * FROM group_polls WHERE id = ?').get(pollId) as Record<string, unknown> | undefined;
  if (!poll) return { success: false, error: 'Poll not found' };
  if (poll.status !== 'open') return { success: false, error: 'Poll is closed' };

  // Access check
  const hasTripAccess = db.prepare(`
    SELECT 1 FROM trips WHERE id = ? AND user_id = ?
    UNION SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?
  `).get(poll.trip_id, userId, poll.trip_id, userId);
  if (!hasTripAccess) return { success: false, error: 'Forbidden' };

  const count = (db.prepare('SELECT COUNT(*) AS c FROM group_poll_options WHERE poll_id = ?').get(pollId) as { c: number }).c;
  const optionId = require('crypto').randomBytes(12).toString('hex');

  db.prepare(`
    INSERT INTO group_poll_options (id, poll_id, label, description, lat, lng, image_url, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    optionId, pollId,
    data.label.trim(),
    data.description || null,
    data.lat ?? null,
    data.lng ?? null,
    data.image_url || null,
    count
  );

  const option = db.prepare('SELECT * FROM group_poll_options WHERE id = ?').get(optionId);
  return { success: true, option: option as Record<string, unknown> };
}

export function deletePollOption(
  optionId: string,
  userId: number
): { success: boolean; error?: string } {
  const opt = db.prepare(`
    SELECT o.*, p.status, p.created_by, p.trip_id
    FROM group_poll_options o
    JOIN group_polls p ON p.id = o.poll_id
    WHERE o.id = ?
  `).get(optionId) as Record<string, unknown> | undefined;

  if (!opt) return { success: false, error: 'Option not found' };
  if (opt.status !== 'open') return { success: false, error: 'Poll is closed' };

  // Only creator of poll or trip owner can delete options
  const isOwner = db.prepare(`
    SELECT 1 FROM trips WHERE id = ? AND user_id = ?
  `).get(opt.trip_id, userId);
  if (opt.created_by !== userId && !isOwner) return { success: false, error: 'Forbidden' };

  db.prepare('DELETE FROM group_poll_options WHERE id = ?').run(optionId);
  return { success: true };
}

// ── Voting ───────────────────────────────────────────────────────────────────
export function castVote(
  pollId: string,
  optionId: string,
  userId: number
): { success: boolean; error?: string } {
  const poll = db.prepare('SELECT * FROM group_polls WHERE id = ?').get(pollId) as Record<string, unknown> | undefined;
  if (!poll) return { success: false, error: 'Poll not found' };
  if (poll.status !== 'open') return { success: false, error: 'Poll is closed' };
  if (poll.deadline && new Date(poll.deadline as string) < new Date()) {
    return { success: false, error: 'Poll deadline has passed' };
  }

  const option = db.prepare('SELECT id FROM group_poll_options WHERE id = ? AND poll_id = ?').get(optionId, pollId);
  if (!option) return { success: false, error: 'Option not found' };

  // Access check
  const hasTripAccess = db.prepare(`
    SELECT 1 FROM trips WHERE id = ? AND user_id = ?
    UNION SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?
  `).get(poll.trip_id, userId, poll.trip_id, userId);
  if (!hasTripAccess) return { success: false, error: 'Forbidden' };

  // Single choice: remove existing vote first
  if (poll.type === 'single_choice' || !poll.type) {
    db.prepare('DELETE FROM group_poll_votes WHERE poll_id = ? AND user_id = ?').run(pollId, userId);
  }

  // Toggle: if already voted on this option, retract
  const existing = db.prepare('SELECT id FROM group_poll_votes WHERE poll_id = ? AND option_id = ? AND user_id = ?').get(pollId, optionId, userId);
  if (existing) {
    db.prepare('DELETE FROM group_poll_votes WHERE poll_id = ? AND option_id = ? AND user_id = ?').run(pollId, optionId, userId);
  } else {
    const voteId = require('crypto').randomBytes(12).toString('hex');
    db.prepare(`
      INSERT INTO group_poll_votes (id, poll_id, option_id, user_id)
      VALUES (?, ?, ?, ?)
    `).run(voteId, pollId, optionId, userId);
  }

  return { success: true };
}

export function retractVote(
  pollId: string,
  optionId: string,
  userId: number
): { success: boolean; error?: string } {
  const poll = db.prepare('SELECT status FROM group_polls WHERE id = ?').get(pollId) as { status: string } | undefined;
  if (!poll) return { success: false, error: 'Poll not found' };
  if (poll.status !== 'open') return { success: false, error: 'Poll is closed' };

  db.prepare('DELETE FROM group_poll_votes WHERE poll_id = ? AND option_id = ? AND user_id = ?').run(pollId, optionId, userId);
  return { success: true };
}

// ── Poll status management ───────────────────────────────────────────────────
export function updateGroupPollStatus(
  pollId: string,
  userId: number,
  status: 'closed' | 'decided',
  decidedOptionId?: string
): { success: boolean; error?: string } {
  const poll = db.prepare(`
    SELECT p.*, t.user_id AS trip_owner
    FROM group_polls p
    JOIN trips t ON t.id = p.trip_id
    WHERE p.id = ?
  `).get(pollId) as Record<string, unknown> | undefined;
  if (!poll) return { success: false, error: 'Poll not found' };

  // Only trip owner or poll creator can close/decide
  const isGroupAdmin = db.prepare(`
    SELECT gm.role FROM group_trips gt
    JOIN group_members gm ON gm.group_id = gt.group_id AND gm.user_id = ?
    WHERE gt.trip_id = ?
  `).get(userId, poll.trip_id) as { role: string } | undefined;

  const canManage = poll.trip_owner === userId || poll.created_by === userId ||
    (isGroupAdmin && (isGroupAdmin.role === 'owner' || isGroupAdmin.role === 'admin'));
  if (!canManage) return { success: false, error: 'Forbidden' };

  if (decidedOptionId) {
    const opt = db.prepare('SELECT id FROM group_poll_options WHERE id = ? AND poll_id = ?').get(decidedOptionId, pollId);
    if (!opt) return { success: false, error: 'Option not found' };
  }

  db.prepare(`
    UPDATE group_polls SET status = ?, decided_option_id = ?, updated_at = datetime('now') WHERE id = ?
  `).run(status, decidedOptionId || null, pollId);

  return { success: true };
}

// ── Ranked voting ───────────────────────────────────────────────────────────
export function castRankedVotes(
  pollId: string,
  rankings: Array<{ option_id: string; rank: number }>,
  userId: number
): { success: boolean; error?: string } {
  const poll = db.prepare('SELECT * FROM group_polls WHERE id = ?').get(pollId) as Record<string, unknown> | undefined;
  if (!poll) return { success: false, error: 'Poll not found' };
  if (poll.type !== 'ranked') return { success: false, error: 'Not a ranked poll' };
  if (poll.status !== 'open') return { success: false, error: 'Poll is closed' };
  if (poll.deadline && new Date(poll.deadline as string) < new Date()) {
    return { success: false, error: 'Poll deadline has passed' };
  }

  const hasTripAccess = db.prepare(`
    SELECT 1 FROM trips WHERE id = ? AND user_id = ?
    UNION SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?
  `).get(poll.trip_id, userId, poll.trip_id, userId);
  if (!hasTripAccess) return { success: false, error: 'Forbidden' };

  // Verify all option_ids belong to this poll
  for (const r of rankings) {
    const opt = db.prepare('SELECT id FROM group_poll_options WHERE id = ? AND poll_id = ?').get(r.option_id, pollId);
    if (!opt) return { success: false, error: `Option ${r.option_id} not found` };
  }

  db.transaction(() => {
    db.prepare('DELETE FROM group_poll_votes WHERE poll_id = ? AND user_id = ?').run(pollId, userId);
    const insert = db.prepare(`
      INSERT INTO group_poll_votes (id, poll_id, option_id, user_id, rank)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const r of rankings) {
      const voteId = require('crypto').randomBytes(12).toString('hex');
      insert.run(voteId, pollId, r.option_id, userId, r.rank);
    }
  })();

  return { success: true };
}

// ── Swipe voting ─────────────────────────────────────────────────────────────
export function castSwipeVote(
  pollId: string,
  optionId: string,
  swipeValue: 'like' | 'dislike' | 'superlike',
  userId: number
): { success: boolean; error?: string } {
  const poll = db.prepare('SELECT * FROM group_polls WHERE id = ?').get(pollId) as Record<string, unknown> | undefined;
  if (!poll) return { success: false, error: 'Poll not found' };
  if (poll.type !== 'swipe') return { success: false, error: 'Not a swipe poll' };
  if (poll.status !== 'open') return { success: false, error: 'Poll is closed' };

  const option = db.prepare('SELECT id FROM group_poll_options WHERE id = ? AND poll_id = ?').get(optionId, pollId);
  if (!option) return { success: false, error: 'Option not found' };

  const hasTripAccess = db.prepare(`
    SELECT 1 FROM trips WHERE id = ? AND user_id = ?
    UNION SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?
  `).get(poll.trip_id, userId, poll.trip_id, userId);
  if (!hasTripAccess) return { success: false, error: 'Forbidden' };

  const existing = db.prepare(
    'SELECT id FROM group_poll_votes WHERE poll_id = ? AND option_id = ? AND user_id = ?'
  ).get(pollId, optionId, userId) as { id: string } | undefined;

  if (existing) {
    db.prepare('UPDATE group_poll_votes SET swipe_value = ? WHERE id = ?').run(swipeValue, existing.id);
  } else {
    const voteId = require('crypto').randomBytes(12).toString('hex');
    db.prepare(`
      INSERT INTO group_poll_votes (id, poll_id, option_id, user_id, swipe_value)
      VALUES (?, ?, ?, ?, ?)
    `).run(voteId, pollId, optionId, userId, swipeValue);
  }

  return { success: true };
}

export function getSwipeMatches(pollId: string, userId: number): Record<string, unknown>[] {
  const poll = db.prepare('SELECT * FROM group_polls WHERE id = ?').get(pollId) as Record<string, unknown> | undefined;
  if (!poll) return [];

  const hasTripAccess = db.prepare(`
    SELECT 1 FROM trips WHERE id = ? AND user_id = ?
    UNION SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?
  `).get(poll.trip_id, userId, poll.trip_id, userId);
  if (!hasTripAccess) return [];

  const options = db.prepare(`
    SELECT o.*,
      SUM(CASE WHEN v.swipe_value = 'superlike' THEN 2 WHEN v.swipe_value = 'like' THEN 1 ELSE 0 END) AS match_score,
      COUNT(CASE WHEN v.swipe_value IN ('like','superlike') THEN 1 END) AS positive_count,
      COUNT(CASE WHEN v.swipe_value = 'superlike' THEN 1 END) AS superlike_count
    FROM group_poll_options o
    LEFT JOIN group_poll_votes v ON v.option_id = o.id AND v.swipe_value IS NOT NULL
    WHERE o.poll_id = ?
    GROUP BY o.id
    ORDER BY match_score DESC, superlike_count DESC
  `).all(pollId) as Record<string, unknown>[];

  return options;
}

// ── Guest voting ──────────────────────────────────────────────────────────────
export function createGuestPollLink(
  pollId: string,
  userId: number
): { success: boolean; token?: string; error?: string } {
  const poll = db.prepare(`
    SELECT p.*, t.user_id AS trip_owner
    FROM group_polls p JOIN trips t ON t.id = p.trip_id
    WHERE p.id = ?
  `).get(pollId) as Record<string, unknown> | undefined;
  if (!poll) return { success: false, error: 'Poll not found' };
  if (!poll.allow_guest_votes) return { success: false, error: 'Guest votes not allowed on this poll' };

  const hasTripAccess = db.prepare(`
    SELECT 1 FROM trips WHERE id = ? AND user_id = ?
    UNION SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?
  `).get(poll.trip_id, userId, poll.trip_id, userId);
  if (!hasTripAccess) return { success: false, error: 'Forbidden' };

  const token = require('crypto').randomBytes(24).toString('base64url');
  const tokenId = require('crypto').randomBytes(12).toString('hex');
  const deadline = poll.deadline as string | null;
  const expiresAt = deadline || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO group_poll_guest_tokens (id, poll_id, token, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(tokenId, pollId, token, expiresAt);

  return { success: true, token };
}

export function getGuestPollByToken(token: string): Record<string, unknown> | null {
  const row = db.prepare(`
    SELECT gt.*, p.id AS poll_id, p.trip_id, p.title, p.description, p.type, p.status,
           p.deadline, p.anonymous, p.decided_option_id
    FROM group_poll_guest_tokens gt
    JOIN group_polls p ON p.id = gt.poll_id
    WHERE gt.token = ? AND gt.expires_at > datetime('now')
  `).get(token) as Record<string, unknown> | undefined;
  if (!row) return null;

  const options = db.prepare(`
    SELECT o.*, COUNT(v.id) AS vote_count
    FROM group_poll_options o
    LEFT JOIN group_poll_votes v ON v.option_id = o.id
    WHERE o.poll_id = ?
    GROUP BY o.id
    ORDER BY o.sort_order, o.created_at
  `).all(row.poll_id as string) as Record<string, unknown>[];

  // Guest's own votes for this token
  const myVotes = db.prepare(`
    SELECT option_id, swipe_value, rank FROM group_poll_votes
    WHERE poll_id = ? AND guest_token = ?
  `).all(row.poll_id as string, token) as Array<{ option_id: string; swipe_value: string | null; rank: number | null }>;

  return {
    poll: {
      id: row.poll_id,
      trip_id: row.trip_id,
      title: row.title,
      description: row.description,
      type: row.type,
      status: row.status,
      deadline: row.deadline,
      decided_option_id: row.decided_option_id,
      options,
    },
    guest_name: row.guest_name,
    my_votes: myVotes,
  };
}

export function castGuestVote(
  token: string,
  votes: Array<{ option_id: string; swipe_value?: string; rank?: number }>,
  guestName: string
): { success: boolean; error?: string } {
  const row = db.prepare(`
    SELECT gt.*, p.type, p.status, p.deadline
    FROM group_poll_guest_tokens gt
    JOIN group_polls p ON p.id = gt.poll_id
    WHERE gt.token = ? AND gt.expires_at > datetime('now')
  `).get(token) as Record<string, unknown> | undefined;

  if (!row) return { success: false, error: 'Invalid or expired guest link' };
  if (row.status !== 'open') return { success: false, error: 'Poll is closed' };
  if (row.deadline && new Date(row.deadline as string) < new Date()) {
    return { success: false, error: 'Poll deadline has passed' };
  }

  const pollId = row.poll_id as string;
  const pollType = row.type as string;

  if (guestName?.trim()) {
    db.prepare('UPDATE group_poll_guest_tokens SET guest_name = ? WHERE token = ?').run(guestName.trim().slice(0, 80), token);
  }

  db.transaction(() => {
    if (pollType === 'ranked') {
      db.prepare('DELETE FROM group_poll_votes WHERE poll_id = ? AND guest_token = ?').run(pollId, token);
      const insert = db.prepare(`
        INSERT INTO group_poll_votes (id, poll_id, option_id, guest_name, guest_token, rank)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const v of votes) {
        if (v.rank == null) continue;
        const opt = db.prepare('SELECT id FROM group_poll_options WHERE id = ? AND poll_id = ?').get(v.option_id, pollId);
        if (!opt) continue;
        insert.run(require('crypto').randomBytes(12).toString('hex'), pollId, v.option_id, guestName, token, v.rank);
      }
    } else if (pollType === 'swipe') {
      for (const v of votes) {
        if (!v.swipe_value || !['like', 'dislike', 'superlike'].includes(v.swipe_value)) continue;
        const opt = db.prepare('SELECT id FROM group_poll_options WHERE id = ? AND poll_id = ?').get(v.option_id, pollId);
        if (!opt) continue;
        const existing = db.prepare(
          'SELECT id FROM group_poll_votes WHERE poll_id = ? AND option_id = ? AND guest_token = ?'
        ).get(pollId, v.option_id, token) as { id: string } | undefined;
        if (existing) {
          db.prepare('UPDATE group_poll_votes SET swipe_value = ? WHERE id = ?').run(v.swipe_value, existing.id);
        } else {
          db.prepare(`
            INSERT INTO group_poll_votes (id, poll_id, option_id, guest_name, guest_token, swipe_value)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(require('crypto').randomBytes(12).toString('hex'), pollId, v.option_id, guestName, token, v.swipe_value);
        }
      }
    } else {
      // single_choice: clear existing, pick one
      // multi_choice: toggle
      if (pollType === 'single_choice') {
        db.prepare('DELETE FROM group_poll_votes WHERE poll_id = ? AND guest_token = ?').run(pollId, token);
      }
      for (const v of votes) {
        const opt = db.prepare('SELECT id FROM group_poll_options WHERE id = ? AND poll_id = ?').get(v.option_id, pollId);
        if (!opt) continue;
        const existing = db.prepare(
          'SELECT id FROM group_poll_votes WHERE poll_id = ? AND option_id = ? AND guest_token = ?'
        ).get(pollId, v.option_id, token);
        if (existing) {
          db.prepare('DELETE FROM group_poll_votes WHERE poll_id = ? AND option_id = ? AND guest_token = ?').run(pollId, v.option_id, token);
        } else {
          db.prepare(`
            INSERT INTO group_poll_votes (id, poll_id, option_id, guest_name, guest_token)
            VALUES (?, ?, ?, ?, ?)
          `).run(require('crypto').randomBytes(12).toString('hex'), pollId, v.option_id, guestName, token);
        }
      }
    }
  })();

  return { success: true };
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
