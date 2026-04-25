import semver from 'semver';
import { db } from '../db/database.js';
import { isAddonEnabled } from '../services/adminService.js';
import type { NoticeCondition, SystemNotice } from './types.js';

interface ConditionContext {
  user: { id: number; login_count: number; first_seen_version: string; role: string; noTrips: number };
  currentAppVersion: string;
  now: Date;
}

// Custom predicate registry — extensible without modifying this file
const customPredicates = new Map<string, (ctx: ConditionContext) => boolean>();
export function registerPredicate(id: string, fn: (ctx: ConditionContext) => boolean): void {
  customPredicates.set(id, fn);
}

function evaluateOne(condition: NoticeCondition, ctx: ConditionContext): boolean {
  switch (condition.kind) {
    case 'always':
      return true;
    case 'firstLogin':
      // login_count is incremented during login, so on the FIRST post-login fetch it's 1.
      return ctx.user.login_count <= 1;
    case 'noTrips':
      return ctx.user.noTrips === 0;

    case 'existingUserBeforeVersion': {
      // Show to users who existed BEFORE this version was released.
      // Backfilled users have first_seen_version='0.0.0', so all pass semver.lt.
      const userVersion = semver.valid(ctx.user.first_seen_version) ?? '0.0.0';
      const noticeVersion = semver.valid(condition.version);
      if (!noticeVersion) return false;
      // Strip prerelease/build metadata so '3.0.0-pre.42' is treated as '3.0.0'.
      const appVersion = semver.coerce(ctx.currentAppVersion)?.version ?? '0.0.0';
      return (
        semver.lt(userVersion, noticeVersion) &&
        semver.gte(appVersion, noticeVersion)
      );
    }

    case 'dateWindow': {
      const start = new Date(condition.startsAt);
      const end = condition.endsAt ? new Date(condition.endsAt) : null;
      return ctx.now >= start && (end === null || ctx.now <= end);
    }

    case 'role':
      return condition.roles.includes(ctx.user.role as 'admin' | 'user');

    case 'addonEnabled':
      return isAddonEnabled(condition.addonId);

    case 'justJoinedGroup': {
      const thirtyMinsAgo = Date.now() - 30 * 60 * 1000;
      // Find the most recent group join for this user
      const joinRow = db.prepare(`
        SELECT CAST(strftime('%s', joined_at) AS INTEGER) * 1000 AS joined_ms
        FROM group_members WHERE user_id = ? ORDER BY joined_at DESC LIMIT 1
      `).get(ctx.user.id) as { joined_ms: number } | undefined;
      if (!joinRow || joinRow.joined_ms < thirtyMinsAgo) return false;
      // Show again if the user joined after they last dismissed this notice
      const dismissal = db.prepare(`
        SELECT dismissed_at FROM user_notice_dismissals WHERE user_id = ? AND notice_id = 'group-welcome-v1'
      `).get(ctx.user.id) as { dismissed_at: number } | undefined;
      return !dismissal || joinRow.joined_ms > dismissal.dismissed_at;
    }

    case 'custom': {
      const fn = customPredicates.get(condition.id);
      if (!fn) {
        console.warn(`[systemNotices] unknown custom predicate: "${condition.id}"`);
        return false;
      }
      return fn(ctx);
    }

    default:
      return false;
  }
}

/** Returns true only if ALL conditions pass (AND logic). */
export function evaluate(notice: SystemNotice, ctx: ConditionContext): boolean {
  return notice.conditions.every(c => evaluateOne(c, ctx));
}

export type { ConditionContext };
