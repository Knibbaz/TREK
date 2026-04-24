import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from '../../i18n'
import { useGroupsStore } from '../../store/groupsStore'
import { Users, ChevronRight, Plus } from 'lucide-react'

export default function GroupQuickLinks(): React.ReactElement | null {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { groups, loadGroups } = useGroupsStore()
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!loaded) {
      loadGroups().then(() => setLoaded(true))
    }
  }, [loaded, loadGroups])

  if (!loaded || groups.length === 0) return null

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {t('groups.title') || 'Groups'}
        </h3>
        <button
          onClick={() => navigate('/groups')}
          className="flex items-center gap-0.5 text-[11px] font-medium transition-opacity hover:opacity-70"
          style={{ color: 'var(--accent)' }}
        >
          {t('common.viewAll') || 'View all'} <ChevronRight size={12} />
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
        {groups.map(group => (
          <button
            key={group.id}
            onClick={() => navigate(`/groups`)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border text-left whitespace-nowrap transition-all hover:shadow-sm"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
          >
            {group.cover_image ? (
              <img src={group.cover_image} alt="" className="w-6 h-6 rounded-md object-cover flex-shrink-0" />
            ) : (
              <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-secondary)' }}>
                <Users size={12} style={{ color: 'var(--text-faint)' }} />
              </div>
            )}
            <div>
              <p className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>{group.name}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                {group.member_count} {t('groups.members') || 'members'} · {group.trip_count} {t('groups.trips') || 'trips'}
              </p>
            </div>
          </button>
        ))}
        <button
          onClick={() => navigate('/groups')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-left whitespace-nowrap transition-all hover:shadow-sm"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)', color: 'var(--text-muted)' }}
        >
          <Plus size={14} />
          <span className="text-[12px] font-medium">{t('groups.create') || 'Create'}</span>
        </button>
      </div>
    </div>
  )
}
