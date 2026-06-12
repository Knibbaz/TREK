import { useEffect, useState } from 'react'
import { X, Check } from 'lucide-react'
import { visitsApi, type VisitPageType, type VisitSourceAnswer } from '../../api/client'
import { useTranslation } from '../../i18n'

const STORAGE_KEY = 'routd_source_poll'
const SHOW_DELAY_MS = 8000

const ANSWERS: VisitSourceAnswer[] = ['social_media', 'friend', 'search_engine', 'blog_website', 'other']

interface Props {
  pageType: VisitPageType
  pageRef: string | undefined
}

/**
 * Dismissible one-time poll on public pages: "How did you find ROUTD?"
 * Asked at most once per browser (localStorage), appears after a short delay.
 */
export default function VisitorPoll({ pageType, pageRef }: Props) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const [answered, setAnswered] = useState(false)

  useEffect(() => {
    if (!pageRef) return
    if (localStorage.getItem(STORAGE_KEY)) return
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    return () => clearTimeout(timer)
  }, [pageRef])

  if (!visible || !pageRef) return null

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'dismissed')
    setVisible(false)
  }

  const answer = (value: VisitSourceAnswer) => {
    localStorage.setItem(STORAGE_KEY, 'answered')
    setAnswered(true)
    visitsApi.survey({ page_type: pageType, page_ref: pageRef, answer: value }).catch(() => {})
    setTimeout(() => setVisible(false), 1800)
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-[1100] w-72 rounded-xl shadow-lg border p-4"
      style={{ background: 'var(--bg-card, #fff)', borderColor: 'var(--border-color, #e2e8f0)', color: 'var(--text-primary, #0f172a)' }}
    >
      {answered ? (
        <div className="flex items-center gap-2 text-sm">
          <Check size={16} className="text-green-500 shrink-0" />
          <span>{t('visitorPoll.thanks') || 'Thanks for your answer!'}</span>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-sm font-medium">{t('visitorPoll.title') || 'How did you find ROUTD?'}</p>
            <button onClick={dismiss} aria-label={t('common.close') || 'Close'} className="opacity-60 hover:opacity-100 shrink-0">
              <X size={16} />
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {ANSWERS.map(value => (
              <button
                key={value}
                onClick={() => answer(value)}
                className="text-left text-sm px-3 py-1.5 rounded-lg border hover:border-[var(--accent,#6366f1)] transition-colors"
                style={{ borderColor: 'var(--border-color, #e2e8f0)' }}
              >
                {t(`visitorPoll.${value}`) || value}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
