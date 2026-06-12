import { useEffect, useState } from 'react'
import { Loader2, Globe, Megaphone, MessageCircleQuestion, Clock } from 'lucide-react'
import { visitsApi } from '../../api/client'
import { useTranslation } from '../../i18n'

type Insights = Awaited<ReturnType<typeof visitsApi.getInsights>>

const PERIODS = [7, 30, 90, 365]

export default function VisitorInsightsPanel() {
  const { t } = useTranslation()
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    visitsApi.getInsights(days)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [days])

  const pageTypeLabel = (type: string) => t(`admin.insights.pageType.${type}`) || type
  const answerLabel = (answer: string) => t(`visitorPoll.${answer}`) || answer

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('admin.insights.title')}</h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('admin.insights.subtitle')}</p>
        </div>
        <div className="flex gap-1">
          {PERIODS.map(p => (
            <button
              key={p}
              onClick={() => setDays(p)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${days === p ? 'border-[var(--accent,#6366f1)] font-medium' : 'opacity-70'}`}
              style={{ borderColor: days === p ? undefined : 'var(--border-color, #e2e8f0)', color: 'var(--text-primary)' }}
            >
              {p} {t('admin.insights.days')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>
      ) : !data || data.totals.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--text-secondary)' }}>{t('admin.insights.empty')}</p>
      ) : (
        <>
          {/* Totals per page type */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {data.totals.map(row => (
              <div key={row.page_type} className="rounded-xl border p-4" style={{ borderColor: 'var(--border-color, #e2e8f0)', background: 'var(--bg-card)' }}>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{pageTypeLabel(row.page_type)}</p>
                <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{row.unique_visitors}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('admin.insights.unique')} · {row.visits} {t('admin.insights.visits').toLowerCase()}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Referrers */}
            <section className="rounded-xl border p-4" style={{ borderColor: 'var(--border-color, #e2e8f0)', background: 'var(--bg-card)' }}>
              <h3 className="flex items-center gap-2 text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
                <Globe size={16} /> {t('admin.insights.referrers')}
              </h3>
              <CountList rows={data.referrers.map(r => ({ label: r.host === '(direct)' ? t('admin.insights.direct') : r.host, count: r.count }))} />
            </section>

            {/* UTM sources */}
            <section className="rounded-xl border p-4" style={{ borderColor: 'var(--border-color, #e2e8f0)', background: 'var(--bg-card)' }}>
              <h3 className="flex items-center gap-2 text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
                <Megaphone size={16} /> {t('admin.insights.utmSources')}
              </h3>
              <CountList rows={data.utmSources.map(r => ({ label: r.utm_source, count: r.count }))} />
            </section>

            {/* Survey answers */}
            <section className="rounded-xl border p-4" style={{ borderColor: 'var(--border-color, #e2e8f0)', background: 'var(--bg-card)' }}>
              <h3 className="flex items-center gap-2 text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
                <MessageCircleQuestion size={16} /> {t('admin.insights.survey')}
              </h3>
              <CountList rows={data.surveyAnswers.map(r => ({ label: answerLabel(r.source_answer), count: r.count }))} />
            </section>

            {/* Recent visits */}
            <section className="rounded-xl border p-4" style={{ borderColor: 'var(--border-color, #e2e8f0)', background: 'var(--bg-card)' }}>
              <h3 className="flex items-center gap-2 text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
                <Clock size={16} /> {t('admin.insights.recent')}
              </h3>
              <div className="space-y-1.5 max-h-72 overflow-y-auto text-sm">
                {data.recent.map((v, i) => (
                  <div key={i} className="flex items-center justify-between gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <span className="truncate">
                      {pageTypeLabel(v.page_type)}
                      {' · '}
                      {v.referrer_host || v.utm_source || t('admin.insights.direct')}
                      {v.source_answer ? ` · ${answerLabel(v.source_answer)}` : ''}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums">{new Date(v.visited_at + 'Z').toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function CountList({ rows }: { rows: Array<{ label: string; count: number }> }) {
  const { t } = useTranslation()
  if (rows.length === 0) {
    return <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('admin.insights.empty')}</p>
  }
  const max = Math.max(...rows.map(r => r.count))
  return (
    <div className="space-y-1.5">
      {rows.map(row => (
        <div key={row.label} className="flex items-center gap-2 text-sm">
          <span className="w-40 truncate shrink-0" style={{ color: 'var(--text-primary)' }} title={row.label}>{row.label}</span>
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary, #f1f5f9)' }}>
            <div className="h-full rounded-full" style={{ width: `${(row.count / max) * 100}%`, background: 'var(--accent, #6366f1)' }} />
          </div>
          <span className="tabular-nums text-xs w-8 text-right" style={{ color: 'var(--text-secondary)' }}>{row.count}</span>
        </div>
      ))}
    </div>
  )
}
