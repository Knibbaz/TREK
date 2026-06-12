import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = express.Router();

const PAGE_TYPES = ['shared_trip', 'journey', 'link_in_bio'] as const;
type PageType = typeof PAGE_TYPES[number];

const SOURCE_ANSWERS = ['social_media', 'friend', 'search_engine', 'blog_website', 'other'] as const;

function getOrSetSessionId(req: Request, res: Response): string {
  let sessionId = req.cookies?.['__trek_session_id'];
  if (!sessionId) {
    sessionId = crypto.randomBytes(16).toString('hex');
    res.cookie('__trek_session_id', sessionId, {
      maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }
  return sessionId;
}

function clean(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

// Log a visit to a public page (no auth). The client sends document.referrer
// and UTM params — the API request's own Referer header would only point back
// at the SPA page itself.
router.post('/', (req: Request, res: Response) => {
  const { page_type, page_ref, referrer, utm_source, utm_medium, utm_campaign } = req.body || {};
  if (!PAGE_TYPES.includes(page_type)) return res.status(400).json({ error: 'Invalid page_type' });
  const pageRef = clean(page_ref, 200);
  if (!pageRef) return res.status(400).json({ error: 'page_ref required' });

  const sessionId = getOrSetSessionId(req, res);

  const referrerVal = clean(referrer, 500);
  let referrerHost: string | null = null;
  if (referrerVal) {
    try { referrerHost = new URL(referrerVal).hostname; } catch { /* keep null */ }
  }

  try {
    db.prepare(`
      INSERT INTO visitor_insights (page_type, page_ref, session_id, referrer, referrer_host, utm_source, utm_medium, utm_campaign)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(page_type, page_ref, session_id) DO UPDATE SET
        referrer      = COALESCE(visitor_insights.referrer, excluded.referrer),
        referrer_host = COALESCE(visitor_insights.referrer_host, excluded.referrer_host),
        utm_source    = COALESCE(visitor_insights.utm_source, excluded.utm_source),
        utm_medium    = COALESCE(visitor_insights.utm_medium, excluded.utm_medium),
        utm_campaign  = COALESCE(visitor_insights.utm_campaign, excluded.utm_campaign)
    `).run(
      page_type as PageType, pageRef, sessionId,
      referrerVal, referrerHost,
      clean(utm_source, 100), clean(utm_medium, 100), clean(utm_campaign, 100),
    );
  } catch (err) {
    console.error('[visitorInsights] Failed to log visit:', err);
  }
  res.status(204).end();
});

// Record the visitor's answer to the "how did you find us?" poll (no auth)
router.post('/survey', (req: Request, res: Response) => {
  const { page_type, page_ref, answer } = req.body || {};
  if (!PAGE_TYPES.includes(page_type)) return res.status(400).json({ error: 'Invalid page_type' });
  const pageRef = clean(page_ref, 200);
  if (!pageRef) return res.status(400).json({ error: 'page_ref required' });
  if (!SOURCE_ANSWERS.includes(answer)) return res.status(400).json({ error: 'Invalid answer' });

  const sessionId = getOrSetSessionId(req, res);

  try {
    db.prepare(`
      INSERT INTO visitor_insights (page_type, page_ref, session_id, source_answer)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(page_type, page_ref, session_id) DO UPDATE SET
        source_answer = excluded.source_answer
    `).run(page_type as PageType, pageRef, sessionId, answer);
  } catch (err) {
    console.error('[visitorInsights] Failed to record survey answer:', err);
  }
  res.status(204).end();
});

// Aggregated insights (admin only)
router.get('/insights', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  if (authReq.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can view visitor insights' });
  }

  const days = Math.min(Math.max(parseInt(String(req.query.days)) || 30, 1), 365);
  const since = `-${days} days`;

  const totals = db.prepare(`
    SELECT page_type, COUNT(*) as visits, COUNT(DISTINCT session_id) as unique_visitors
    FROM visitor_insights
    WHERE visited_at >= datetime('now', ?)
    GROUP BY page_type
  `).all(since) as Array<{ page_type: string; visits: number; unique_visitors: number }>;

  const referrers = db.prepare(`
    SELECT COALESCE(referrer_host, '(direct)') as host, COUNT(*) as count
    FROM visitor_insights
    WHERE visited_at >= datetime('now', ?)
    GROUP BY host
    ORDER BY count DESC
    LIMIT 25
  `).all(since) as Array<{ host: string; count: number }>;

  const utmSources = db.prepare(`
    SELECT utm_source, COUNT(*) as count
    FROM visitor_insights
    WHERE visited_at >= datetime('now', ?) AND utm_source IS NOT NULL
    GROUP BY utm_source
    ORDER BY count DESC
    LIMIT 25
  `).all(since) as Array<{ utm_source: string; count: number }>;

  const surveyAnswers = db.prepare(`
    SELECT source_answer, COUNT(*) as count
    FROM visitor_insights
    WHERE visited_at >= datetime('now', ?) AND source_answer IS NOT NULL
    GROUP BY source_answer
    ORDER BY count DESC
  `).all(since) as Array<{ source_answer: string; count: number }>;

  const recent = db.prepare(`
    SELECT page_type, page_ref, referrer_host, utm_source, utm_medium, utm_campaign, source_answer, visited_at
    FROM visitor_insights
    WHERE visited_at >= datetime('now', ?)
    ORDER BY visited_at DESC
    LIMIT 50
  `).all(since) as Array<Record<string, unknown>>;

  res.json({ days, totals, referrers, utmSources, surveyAnswers, recent });
});

export default router;
