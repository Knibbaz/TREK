import { useState } from 'react';
import { useCreatorHubStore } from '../../../store/creatorHubStore';
import { creatorHubApi } from '../../../api/client';
import { useToast } from '../../shared/Toast';
import { useTranslation } from '../../../i18n';
import { LibConfig } from '../../../types';

const THEMES = [
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Light, clean, minimalist',
    preview: 'white',
  },
  {
    id: 'card',
    name: 'Card',
    description: 'Elevated cards with shadows',
    preview: '#f5f5f5',
  },
  {
    id: 'magazine',
    name: 'Magazine',
    description: 'Grid layout, bold typography',
    preview: '#fafafa',
  },
  {
    id: 'map',
    name: 'Map',
    description: 'Outdoorsy, natural colors',
    preview: '#ecf0f1',
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Dark mode, high contrast',
    preview: '#1a1a1a',
  },
  {
    id: 'glassmorphism',
    name: 'Glassmorphism',
    description: 'Frosted glass, modern',
    preview: '#667eea',
  },
];

const FONTS = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS' },
];

export function LiBThemes() {
  const { t } = useTranslation();
  const { success, error: showError } = useToast();
  const { config, updateConfig, isSaving } = useCreatorHubStore();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<LibConfig>>(config || {});

  if (!config) return null;

  const handleUpdateTheme = async (theme: string) => {
    try {
      const updated = await creatorHubApi.updateLibConfig({ theme });
      updateConfig(updated);
      success('Theme updated');
    } catch (err: any) {
      showError(err?.response?.data?.error || 'Failed to update theme');
    }
  };

  const handleSaveCustomization = async () => {
    try {
      const updated = await creatorHubApi.updateLibConfig(formData);
      updateConfig(updated);
      setIsEditing(false);
      success('Settings saved');
    } catch (err: any) {
      showError(err?.response?.data?.error || 'Failed to save settings');
    }
  };

  return (
    <div style={{ padding: '1rem' }}>
      {/* Theme Selection */}
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Select a Theme</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '1rem',
          }}
        >
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              onClick={() => handleUpdateTheme(theme.id)}
              style={{
                padding: '1rem',
                border: config.theme === theme.id ? '3px solid var(--accent)' : '1px solid var(--border-primary)',
                borderRadius: '0.5rem',
                backgroundColor: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'left',
              }}
            >
              {/* Theme preview box */}
              <div
                style={{
                  width: '100%',
                  height: '80px',
                  backgroundColor: theme.preview,
                  borderRadius: '0.25rem',
                  marginBottom: '0.75rem',
                  border: '1px solid var(--border-primary)',
                }}
              />
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0.5rem 0 0.25rem 0' }}>
                {theme.name}
              </h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                {theme.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Settings */}
      <div style={{ paddingTop: '1.5rem', borderTop: '1px solid var(--border-primary)' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
          Advanced Settings
        </h3>

        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              borderRadius: '0.25rem',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 600,
            }}
          >
            Edit Settings
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Font Family */}
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                Font Family
              </label>
              <select
                value={formData.font_family || 'Inter'}
                onChange={(e) => setFormData({ ...formData, font_family: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '0.25rem',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box',
                }}
              >
                {FONTS.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Tagline */}
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                Tagline
              </label>
              <input
                type="text"
                value={formData.tagline || ''}
                onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '0.25rem',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box',
                }}
                placeholder="e.g. Travel Creator & Photographer"
              />
            </div>

            {/* Accent Color */}
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                Accent Color
              </label>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <input
                  type="color"
                  value={formData.accent_color || '#0066cc'}
                  onChange={(e) => setFormData({ ...formData, accent_color: e.target.value })}
                  style={{
                    width: '60px',
                    height: '40px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '0.25rem',
                    cursor: 'pointer',
                  }}
                />
                <input
                  type="text"
                  value={formData.accent_color || '#0066cc'}
                  onChange={(e) => setFormData({ ...formData, accent_color: e.target.value })}
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '0.25rem',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                  placeholder="#0066cc"
                />
              </div>
            </div>

            {/* Background */}
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                Background Type
              </label>
              <select
                value={formData.background_type || 'solid'}
                onChange={(e) => setFormData({ ...formData, background_type: e.target.value as 'solid' | 'gradient' | 'image' })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '0.25rem',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box',
                  marginBottom: '0.5rem',
                }}
              >
                <option value="solid">Solid Color</option>
                <option value="gradient">Gradient</option>
                <option value="image">Image</option>
              </select>

              {formData.background_type === 'solid' && (
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={formData.background_value || '#ffffff'}
                    onChange={(e) => setFormData({ ...formData, background_value: e.target.value })}
                    style={{
                      width: '60px',
                      height: '40px',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                    }}
                  />
                  <input
                    type="text"
                    value={formData.background_value || '#ffffff'}
                    onChange={(e) => setFormData({ ...formData, background_value: e.target.value })}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '0.25rem',
                      fontSize: '0.9rem',
                      boxSizing: 'border-box',
                    }}
                    placeholder="#ffffff"
                  />
                </div>
              )}

              {formData.background_type === 'gradient' && (
                <input
                  type="text"
                  value={formData.background_value || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}
                  onChange={(e) => setFormData({ ...formData, background_value: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '0.25rem',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                  placeholder="linear-gradient(...)"
                />
              )}

              {formData.background_type === 'image' && (
                <input
                  type="url"
                  value={formData.background_value || ''}
                  onChange={(e) => setFormData({ ...formData, background_value: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '0.25rem',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                  placeholder="https://example.com/image.jpg"
                />
              )}
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={handleSaveCustomization}
                disabled={isSaving}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  backgroundColor: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  opacity: isSaving ? 0.6 : 1,
                }}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
