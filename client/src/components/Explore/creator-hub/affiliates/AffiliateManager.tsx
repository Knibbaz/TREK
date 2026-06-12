import { useEffect, useState } from 'react';
import { Plus, Trash2, Edit, ExternalLink, TrendingUp, X, Check } from 'lucide-react';
import { affiliatesApi } from '../../../../api/client';
import { useToast } from '../../../shared/Toast';
import { AffiliateLink } from '../../../../types';
import { useCreatorHubStore } from '../../../../store/creatorHubStore';

const CATEGORIES = [
  { value: 'accommodation', label: '🏨 Accommodation' },
  { value: 'flights', label: '✈️ Flights' },
  { value: 'activities', label: '🎯 Activities' },
  { value: 'gear', label: '📷 Gear' },
  { value: 'insurance', label: '🛡️ Insurance' },
  { value: 'other', label: '🔗 Other' },
];

const CATEGORY_LABELS: Record<string, string> = {
  accommodation: '🏨',
  flights: '✈️',
  activities: '🎯',
  gear: '📷',
  insurance: '🛡️',
  other: '🔗',
};

interface FormState {
  title: string;
  destination_url: string;
  category: string;
  description: string;
  network: string;
  estimated_commission_rate: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  destination_url: '',
  category: 'other',
  description: '',
  network: '',
  estimated_commission_rate: '',
};

export function AffiliateManager() {
  const { success, error: showError } = useToast();
  const { config } = useCreatorHubStore();
  const [links, setLinks] = useState<AffiliateLink[]>([]);
  const [stats, setStats] = useState<{ totals: { total_links: number; total_clicks: number } } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const [linksData, statsData] = await Promise.all([affiliatesApi.getLinks(), affiliatesApi.getStats()]);
        setLinks(linksData);
        setStats(statsData);
      } catch (err: any) {
        showError(err?.response?.data?.error || 'Failed to load affiliate links');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    if (!form.title || !form.destination_url) {
      showError('Title and URL are required');
      return;
    }
    try {
      setIsSaving(true);
      const data = {
        title: form.title,
        destination_url: form.destination_url,
        category: form.category || null,
        description: form.description || null,
        network: form.network || null,
        estimated_commission_rate: form.estimated_commission_rate ? parseFloat(form.estimated_commission_rate) : null,
      };
      const newLink = await affiliatesApi.createLink(data);
      setLinks((prev) => [newLink, ...prev]);
      setForm(EMPTY_FORM);
      setShowForm(false);
      success('Affiliate link created');
    } catch (err: any) {
      showError(err?.response?.data?.error || 'Failed to create link');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingId || !form.title || !form.destination_url) return;
    try {
      setIsSaving(true);
      const data = {
        title: form.title,
        destination_url: form.destination_url,
        category: form.category || null,
        description: form.description || null,
        network: form.network || null,
        estimated_commission_rate: form.estimated_commission_rate ? parseFloat(form.estimated_commission_rate) : null,
      };
      const updated = await affiliatesApi.updateLink(editingId, data);
      setLinks((prev) => prev.map((l) => (l.id === editingId ? updated : l)));
      setEditingId(null);
      setForm(EMPTY_FORM);
      success('Link updated');
    } catch (err: any) {
      showError(err?.response?.data?.error || 'Failed to update link');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this affiliate link?')) return;
    try {
      await affiliatesApi.deleteLink(id);
      setLinks((prev) => prev.filter((l) => l.id !== id));
      success('Link deleted');
    } catch (err: any) {
      showError(err?.response?.data?.error || 'Failed to delete link');
    }
  };

  const handleToggleActive = async (link: AffiliateLink) => {
    try {
      const updated = await affiliatesApi.updateLink(link.id, { is_active: !link.is_active });
      setLinks((prev) => prev.map((l) => (l.id === link.id ? updated : l)));
    } catch (err: any) {
      showError(err?.response?.data?.error || 'Failed to toggle link');
    }
  };

  const handleStartEdit = (link: AffiliateLink) => {
    setEditingId(link.id);
    setShowForm(false);
    setForm({
      title: link.title,
      destination_url: link.destination_url,
      category: link.category || 'other',
      description: link.description || '',
      network: link.network || '',
      estimated_commission_rate: link.estimated_commission_rate?.toString() || '',
    });
  };

  const handleCopyUrl = async (link: AffiliateLink) => {
    const origin = window.location.origin;
    const slug = config?.slug || '';
    const url = `${origin}/api/public/go/${slug}/${link.short_code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      showError('Failed to copy URL');
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  if (isLoading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading...
      </div>
    );
  }

  const totalClicks = stats?.totals?.total_clicks ?? 0;
  const totalLinks = links.length;

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Header + Stats */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Affiliate Links</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
            Manage trackable short links for your affiliate partnerships
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.6rem 1rem',
            backgroundColor: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.9rem',
          }}
        >
          <Plus size={16} /> Add Link
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[
          { label: 'Active links', value: totalLinks },
          { label: 'Total clicks', value: totalClicks, icon: <TrendingUp size={14} /> },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              flex: '1 1 120px',
              padding: '1rem',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '0.5rem',
              border: '1px solid var(--border-primary)',
            }}
          >
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stat.value}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              {stat.icon}{stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit Form */}
      {(showForm || editingId) && (
        <LinkForm
          form={form}
          setForm={setForm}
          onSave={editingId ? handleUpdate : handleCreate}
          onCancel={handleCancel}
          isSaving={isSaving}
          isEditing={!!editingId}
        />
      )}

      {/* Links Table */}
      {links.length === 0 && !showForm ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', border: '2px dashed var(--border-primary)', borderRadius: '0.5rem' }}>
          No affiliate links yet. Add one to start tracking clicks.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {links.map((link) => (
            editingId === link.id ? null : (
              <div
                key={link.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.875rem 1rem',
                  backgroundColor: link.is_active ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '0.5rem',
                  opacity: link.is_active ? 1 : 0.6,
                  flexWrap: 'wrap',
                }}
              >
                {/* Category icon + title */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>{CATEGORY_LABELS[link.category || 'other'] || '🔗'}</span>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {link.title}
                    </span>
                  </div>
                  {link.description && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {link.description}
                    </div>
                  )}
                </div>

                {/* Clicks */}
                <div style={{ textAlign: 'center', minWidth: '60px' }}>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>{link.click_count}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>clicks</div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  {/* Copy short URL */}
                  <button
                    onClick={() => handleCopyUrl(link)}
                    title="Copy short URL"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.4rem', color: copiedId === link.id ? '#22c55e' : 'var(--text-muted)', display: 'flex' }}
                  >
                    {copiedId === link.id ? <Check size={16} /> : <ExternalLink size={16} />}
                  </button>

                  {/* Toggle active */}
                  <button
                    onClick={() => handleToggleActive(link)}
                    title={link.is_active ? 'Deactivate' : 'Activate'}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0.4rem',
                      fontSize: '0.75rem',
                      color: link.is_active ? 'var(--accent)' : 'var(--text-muted)',
                      fontWeight: 600,
                    }}
                  >
                    {link.is_active ? 'ON' : 'OFF'}
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => handleStartEdit(link)}
                    title="Edit"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.4rem', color: 'var(--accent)', display: 'flex' }}
                  >
                    <Edit size={16} />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(link.id)}
                    title="Delete"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.4rem', color: '#d32f2f', display: 'flex' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
}

function LinkForm({
  form,
  setForm,
  onSave,
  onCancel,
  isSaving,
  isEditing,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  isEditing: boolean;
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid var(--border-primary)',
    borderRadius: '0.25rem',
    fontSize: '0.9rem',
    boxSizing: 'border-box',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.8rem',
    fontWeight: 600,
    display: 'block',
    marginBottom: '0.25rem',
    color: 'var(--text-muted)',
  };

  return (
    <div
      style={{
        marginBottom: '1.5rem',
        padding: '1.25rem',
        backgroundColor: 'var(--bg-secondary)',
        border: '2px solid var(--accent)',
        borderRadius: '0.5rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
          {isEditing ? 'Edit Link' : 'New Affiliate Link'}
        </h3>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <X size={18} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <label style={labelStyle}>Title *</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            style={inputStyle}
            placeholder="e.g. 10% off Booking.com"
          />
        </div>
        <div>
          <label style={labelStyle}>Category</label>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            style={inputStyle}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Destination URL *</label>
          <input
            type="url"
            value={form.destination_url}
            onChange={(e) => setForm({ ...form, destination_url: e.target.value })}
            style={inputStyle}
            placeholder="https://booking.com/affiliate?ref=..."
          />
        </div>
        <div>
          <label style={labelStyle}>Description</label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            style={inputStyle}
            placeholder="Short description for your audience"
          />
        </div>
        <div>
          <label style={labelStyle}>Network</label>
          <input
            type="text"
            value={form.network}
            onChange={(e) => setForm({ ...form, network: e.target.value })}
            style={inputStyle}
            placeholder="e.g. Travelpayouts, Amazon, custom"
          />
        </div>
        <div>
          <label style={labelStyle}>Est. Commission %</label>
          <input
            type="number"
            value={form.estimated_commission_rate}
            onChange={(e) => setForm({ ...form, estimated_commission_rate: e.target.value })}
            style={inputStyle}
            placeholder="e.g. 4.5"
            min="0"
            max="100"
            step="0.1"
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <button
          onClick={onSave}
          disabled={isSaving}
          style={{
            flex: 1,
            padding: '0.7rem',
            backgroundColor: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: '0.25rem',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            fontSize: '0.9rem',
            opacity: isSaving ? 0.6 : 1,
          }}
        >
          {isSaving ? 'Saving...' : isEditing ? 'Update' : 'Create Link'}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '0.7rem 1.5rem',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: '0.25rem',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.9rem',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
