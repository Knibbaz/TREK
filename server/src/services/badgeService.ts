import Database from 'better-sqlite3';

export type BadgeType = 'verified_creator' | 'top_seller' | 'highly_rated' | 'globe_trotter' | 'trending' | 'consistent';

export interface BadgeDefinition {
  type: BadgeType;
  emoji: string;
  label_nl: string;
  label_en: string;
  description_nl: string;
  description_en: string;
  criteria_nl: string;
}

export const BADGES: Record<BadgeType, BadgeDefinition> = {
  verified_creator: {
    type: 'verified_creator',
    emoji: '⭐',
    label_nl: 'Geverifieerde Creator',
    label_en: 'Verified Creator',
    description_nl: 'Goedgekeurd creator profiel',
    description_en: 'Approved creator profile',
    criteria_nl: 'Profiel goedgekeurd door admin',
  },
  top_seller: {
    type: 'top_seller',
    emoji: '🏆',
    label_nl: 'Top Verkoper',
    label_en: 'Top Seller',
    description_nl: 'Heeft meer dan 50 trips verkocht',
    description_en: 'Sold more than 50 trips',
    criteria_nl: 'Totaal 50+ verkopen',
  },
  highly_rated: {
    type: 'highly_rated',
    emoji: '💎',
    label_nl: 'Hoog Gewaardeerd',
    label_en: 'Highly Rated',
    description_nl: 'Gemiddelde rating ≥ 4,5 met 10+ reviews',
    description_en: 'Average rating ≥ 4.5 with 10+ reviews',
    criteria_nl: '4.5+ rating, 10+ reviews',
  },
  globe_trotter: {
    type: 'globe_trotter',
    emoji: '🌍',
    label_nl: 'Wereldreiziger',
    label_en: 'Globe Trotter',
    description_nl: 'Listings op 3+ continenten',
    description_en: 'Listings on 3+ continents',
    criteria_nl: '3+ verschillende continenten',
  },
  trending: {
    type: 'trending',
    emoji: '🔥',
    label_nl: 'Populair',
    label_en: 'Trending',
    description_nl: 'Een listing in top 10 deze maand',
    description_en: 'One listing in top 10 this month',
    criteria_nl: 'Top 10 meest bekeken deze maand',
  },
  consistent: {
    type: 'consistent',
    emoji: '📅',
    label_nl: 'Consistente Creator',
    label_en: 'Consistent',
    description_nl: 'Alle listings bijgewerkt in afgelopen 3 maanden',
    description_en: 'All listings updated in last 3 months',
    criteria_nl: 'Alle listings recent actief',
  },
};

/**
 * Check if creator is eligible for verified_creator badge.
 */
function isEligibleVerifiedCreator(db: Database.Database, creatorUserId: number): boolean {
  const creator = db.prepare('SELECT status FROM explore_creators WHERE user_id = ?').get(creatorUserId) as { status: string } | undefined;
  return creator?.status === 'approved';
}

/**
 * Check if creator is eligible for top_seller badge.
 */
function isEligibleTopSeller(db: Database.Database, creatorUserId: number): boolean {
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM explore_user_trips eut
    JOIN explore_published ep ON ep.trip_id = eut.source_trip_id
    WHERE ep.submitted_by = ?
  `).get(creatorUserId) as { count: number } | undefined;
  return (result?.count || 0) >= 50;
}

/**
 * Check if creator is eligible for highly_rated badge.
 */
function isEligibleHighlyRated(db: Database.Database, creatorUserId: number): boolean {
  const result = db.prepare(`
    SELECT AVG(er.rating) as avg_rating, COUNT(*) as review_count
    FROM explore_reviews er
    JOIN explore_published ep ON ep.trip_id = er.source_trip_id
    WHERE ep.submitted_by = ?
  `).get(creatorUserId) as { avg_rating: number; review_count: number } | undefined;

  if (!result) return false;
  return (result.avg_rating || 0) >= 4.5 && (result.review_count || 0) >= 10;
}

/**
 * Check if creator is eligible for globe_trotter badge.
 */
function isEligibleGlobeTrotter(db: Database.Database, creatorUserId: number): boolean {
  const result = db.prepare(`
    SELECT COUNT(DISTINCT ep.continent) as continent_count
    FROM explore_published ep
    WHERE ep.submitted_by = ? AND ep.continent IS NOT NULL
  `).get(creatorUserId) as { continent_count: number } | undefined;
  return (result?.continent_count || 0) >= 3;
}

/**
 * Check if creator is eligible for trending badge.
 * Creator has at least one listing in the global top 10 most-viewed this month.
 */
function isEligibleTrending(db: Database.Database, creatorUserId: number): boolean {
  // Top 10 most viewed listings globally, updated in last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0];

  const result = db.prepare(`
    SELECT COUNT(*) as count FROM (
      SELECT 1
      FROM explore_published ep
      WHERE ep.submitted_by = ?
      AND ep.updated_at >= ?
      AND ep.trip_id IN (
        SELECT trip_id FROM explore_published
        WHERE updated_at >= ?
        AND is_published = 1
        ORDER BY view_count DESC
        LIMIT 10
      )
    )
  `).get(creatorUserId, cutoffDate, cutoffDate) as { count: number } | undefined;

  return (result?.count || 0) > 0;
}

/**
 * Check if creator is eligible for consistent badge.
 */
function isEligibleConsistent(db: Database.Database, creatorUserId: number): boolean {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const cutoffDate = ninetyDaysAgo.toISOString().split('T')[0];

  // Count listings that haven't been updated in 90 days
  const staleCount = db.prepare(`
    SELECT COUNT(*) as count FROM explore_published ep
    WHERE ep.submitted_by = ? AND ep.updated_at < ?
  `).get(creatorUserId, cutoffDate) as { count: number } | undefined;

  return (staleCount?.count || 0) === 0;
}

const eligibilityChecks: Record<BadgeType, (db: Database.Database, userId: number) => boolean> = {
  verified_creator: isEligibleVerifiedCreator,
  top_seller: isEligibleTopSeller,
  highly_rated: isEligibleHighlyRated,
  globe_trotter: isEligibleGlobeTrotter,
  trending: isEligibleTrending,
  consistent: isEligibleConsistent,
};

/**
 * Get all badges for a creator (active only).
 */
export function getCreatorBadges(db: Database.Database, creatorUserId: number): BadgeType[] {
  const badges = db.prepare(`
    SELECT badge_type FROM creator_badges
    WHERE creator_user_id = ? AND revoked_at IS NULL
    ORDER BY awarded_at DESC
  `).all(creatorUserId) as Array<{ badge_type: BadgeType }>;

  return badges.map(b => b.badge_type);
}

/**
 * Check if creator currently has a badge.
 */
export function hasCreatorBadge(db: Database.Database, creatorUserId: number, badgeType: BadgeType): boolean {
  const badge = db.prepare(`
    SELECT 1 FROM creator_badges
    WHERE creator_user_id = ? AND badge_type = ? AND revoked_at IS NULL
  `).get(creatorUserId, badgeType);
  return !!badge;
}

/**
 * Award a badge if eligible. Returns true if awarded (or already had it).
 */
export function awardBadgeIfEligible(db: Database.Database, creatorUserId: number, badgeType: BadgeType): boolean {
  const eligibilityCheck = eligibilityChecks[badgeType];
  if (!eligibilityCheck) return false;

  const isEligible = eligibilityCheck(db, creatorUserId);
  if (!isEligible) return false;

  const existing = db.prepare(`
    SELECT id, revoked_at FROM creator_badges
    WHERE creator_user_id = ? AND badge_type = ?
  `).get(creatorUserId, badgeType) as { id: number; revoked_at: string | null } | undefined;

  if (existing) {
    if (!existing.revoked_at) {
      // Already has active badge
      return true;
    }
    // Restore revoked badge
    db.prepare(`
      UPDATE creator_badges SET revoked_at = NULL, awarded_at = datetime('now')
      WHERE id = ?
    `).run(existing.id);
  } else {
    // Create new badge
    db.prepare(`
      INSERT INTO creator_badges (creator_user_id, badge_type, awarded_at)
      VALUES (?, ?, datetime('now'))
    `).run(creatorUserId, badgeType);
  }

  return true;
}

/**
 * Recalculate all badges for a creator.
 */
export function recalculateCreatorBadges(db: Database.Database, creatorUserId: number): void {
  // Award all eligible badges
  for (const badgeType of Object.keys(eligibilityChecks) as BadgeType[]) {
    const isEligible = eligibilityChecks[badgeType](db, creatorUserId);
    const hasBadge = hasCreatorBadge(db, creatorUserId, badgeType);

    if (isEligible && !hasBadge) {
      awardBadgeIfEligible(db, creatorUserId, badgeType);
    } else if (!isEligible && hasBadge) {
      // Revoke badge
      db.prepare(`
        UPDATE creator_badges SET revoked_at = datetime('now')
        WHERE creator_user_id = ? AND badge_type = ?
      `).run(creatorUserId, badgeType);
    }
  }
}

/**
 * Revoke a specific badge.
 */
export function revokeBadge(db: Database.Database, creatorUserId: number, badgeType: BadgeType): void {
  db.prepare(`
    UPDATE creator_badges SET revoked_at = datetime('now')
    WHERE creator_user_id = ? AND badge_type = ? AND revoked_at IS NULL
  `).run(creatorUserId, badgeType);
}
