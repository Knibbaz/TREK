import { useState } from 'react'
import { adminApi } from '../../api/client'
import { useToast } from '../../components/shared/Toast'
import { useTranslation } from '../../i18n'
import { Crown, Eye, EyeOff } from 'lucide-react'

// Every gateable admin tab. 'whitelabel' itself is intentionally absent —
// the superadmin can never lock themselves out.
const GATEABLE_TABS: { id: string; labelKey: string; fallback: string; hint?: string }[] = [
  { id: 'users', labelKey: 'admin.tabs.users', fallback: 'Users' },
  { id: 'config', labelKey: 'admin.tabs.config', fallback: 'Config' },
  { id: 'defaults', labelKey: 'admin.tabs.defaults', fallback: 'User defaults' },
  { id: 'addons', labelKey: 'admin.tabs.addons', fallback: 'Addons' },
  { id: 'explore', labelKey: 'admin.tabs.explore', fallback: 'Explore' },
  { id: 'payouts', labelKey: 'admin.tabs.payouts', fallback: 'Payouts' },
  { id: 'branding', labelKey: 'admin.tabs.branding', fallback: 'Branding', hint: 'Vaak superadmin-only bij white-label klanten' },
  { id: 'insights', labelKey: 'admin.tabs.insights', fallback: 'Visitor Insights' },
  { id: 'gdpr', labelKey: 'admin.tabs.gdpr', fallback: 'GDPR' },
  { id: 'settings', labelKey: 'admin.tabs.settings', fallback: 'Settings' },
  { id: 'notifications', labelKey: 'admin.tabs.notifications', fallback: 'Notifications' },
  { id: 'backup', labelKey: 'admin.tabs.backup', fallback: 'Backup' },
  { id: 'audit', labelKey: 'admin.tabs.audit', fallback: 'Audit log' },
  { id: 'mcp-tokens', labelKey: 'admin.tabs.mcpTokens', fallback: 'MCP tokens' },
  { id: 'github', labelKey: 'admin.tabs.github', fallback: 'GitHub / updates', hint: 'Verberg dit als jij de updates beheert' },
]

export function AdminWhitelabelTab({ disabledTabs, setDisabledTabs }: {
  disabledTabs: string[]
  setDisabledTabs: (tabs: string[]) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [saving, setSaving] = useState(false)

  const toggle = async (id: string) => {
    const next = disabledTabs.includes(id)
      ? disabledTabs.filter(x => x !== id)
      : [...disabledTabs, id]
    setSaving(true)
    try {
      const res = await adminApi.updateWhitelabelConfig(next)
      setDisabledTabs(res.disabled_admin_tabs)
    } catch {
      toast.error(t('common.errorOccurred'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border overflow-hidden bg-surface-card border-edge">
      <div className="px-6 py-4 border-b border-edge-secondary">
        <h2 className="font-semibold text-content flex items-center gap-2">
          <Crown size={15} /> White-label
        </h2>
        <p className="text-xs mt-1 text-content-muted">
          Bepaal welke admin-menu-items het klant-adminaccount te zien krijgt.
          Jij (superadmin) ziet altijd alles. Wijzigingen gelden direct.
        </p>
      </div>
      <div className="p-4 flex flex-col gap-1">
        {GATEABLE_TABS.map(tab => {
          const hidden = disabledTabs.includes(tab.id)
          return (
            <button
              key={tab.id}
              onClick={() => toggle(tab.id)}
              disabled={saving}
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface-secondary"
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}
            >
              <span>
                <span className="text-sm font-medium" style={{ color: hidden ? 'var(--text-faint)' : 'var(--text-primary)', textDecoration: hidden ? 'line-through' : 'none' }}>
                  {t(tab.labelKey) || tab.fallback}
                </span>
                {tab.hint && <span className="block text-[11px] text-content-faint">{tab.hint}</span>}
              </span>
              <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: hidden ? '#ef4444' : '#059669' }}>
                {hidden ? <><EyeOff size={13} /> verborgen</> : <><Eye size={13} /> zichtbaar</>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
