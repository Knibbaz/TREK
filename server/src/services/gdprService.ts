import crypto from 'crypto';
import { db } from '../db/database';
import { sendEmail } from './notifications';
import { deleteUserCompletely } from './userCleanupService';

/**
 * Mark user account for deletion — 14-day grace period begins
 */
export function requestDeletion(userId: number, userEmail: string): void {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users
    SET pending_deletion = 1, deletion_requested_at = ?
    WHERE id = ?
  `).run(now, userId);

  // Send email notification
  const deleteAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  sendEmail(
    userEmail,
    'Account Deletion Requested',
    `Your account deletion has been requested and will be completed on ${deleteAt.toLocaleDateString()}. ` +
    `If you did not request this, log in to your account and click "Cancel deletion" within 14 days to restore access.`
  );
}

/**
 * Cancel pending deletion within grace period
 */
export function cancelDeletion(userId: number): void {
  db.prepare(`
    UPDATE users
    SET pending_deletion = 0, deletion_requested_at = NULL
    WHERE id = ?
  `).run(userId);
}

/**
 * Anonymize user before hard deletion
 * Replaces personal data with placeholders
 */
export function anonymizeUser(userId: number): void {
  const randomId = crypto.randomBytes(4).toString('hex');
  const anonEmail = `deleted_${randomId}@deleted.invalid`;

  db.prepare(`
    UPDATE users
    SET
      username = ?,
      email = ?,
      avatar = NULL,
      maps_api_key = NULL,
      unsplash_api_key = NULL,
      openweather_api_key = NULL,
      mfa_secret = NULL,
      mfa_backup_codes = NULL,
      immich_url = NULL,
      immich_access_token = NULL,
      synology_url = NULL,
      synology_username = NULL,
      synology_password = NULL,
      synology_sid = NULL,
      synology_did = NULL
    WHERE id = ?
  `).run(`deleted_user_${randomId}`, anonEmail, userId);
}

/**
 * Execute actual GDPR deletion after grace period expires
 * 1. Anonymize user data
 * 2. Delete all related data via deleteUserCompletely
 */
export function executeGdprDeletion(userId: number): void {
  try {
    anonymizeUser(userId);
    deleteUserCompletely(userId);
  } catch (err) {
    console.error(`[GDPR] Failed to delete user ${userId}:`, err);
    throw err;
  }
}
