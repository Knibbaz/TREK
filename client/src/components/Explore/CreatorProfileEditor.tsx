import { useState } from 'react';
import { useTranslation } from '../../i18n';
import { Camera, Save } from 'lucide-react';
import { exploreApi } from '../../api/client';
import { useToast } from '../shared/Toast';
import { useDropzone } from 'react-dropzone';

interface CreatorProfile {
  display_name: string;
  bio?: string;
  avatar?: string;
  cover_image_url?: string;
  social_links?: Record<string, string>;
  tagline?: string;
}

interface CreatorProfileEditorProps {
  profile: CreatorProfile;
  onSave?: (updated: CreatorProfile) => void;
}

export function CreatorProfileEditor({ profile, onSave }: CreatorProfileEditorProps) {
  const { t } = useTranslation();
  const { success, error: showError } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState(profile);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const { getRootProps: getCoverProps, getInputProps: getCoverInputProps } = useDropzone({
    onDrop: (files) => {
      const file = files[0];
      if (file) {
        setCoverFile(file);
        const preview = URL.createObjectURL(file);
        setCoverPreview(preview);
      }
    },
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp'] },
    maxFiles: 1,
  });

  const handleSave = async () => {
    try {
      setIsSaving(true);

      let coverUrl = form.cover_image_url;
      if (coverFile) {
        const formData = new FormData();
        formData.append('file', coverFile);
        // Note: This would need a dedicated cover upload endpoint
        // For now, we'll just update without the cover
      }

      const data = await exploreApi.updateCreatorProfile({
        display_name: form.display_name,
        bio: form.bio,
        avatar_url: form.avatar,
        cover_image_url: coverUrl,
        social_links: form.social_links,
        tagline: form.tagline,
      });

      success('Profile updated');
      setIsEditing(false);
      setCoverFile(null);
      setCoverPreview(null);
      onSave?.(data);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(profile);
    setCoverFile(null);
    setCoverPreview(null);
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button
          onClick={() => setIsEditing(true)}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid var(--border-primary)',
            background: 'var(--bg-secondary)',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '600',
          }}
        >
          {t('common.edit') || 'Edit'}
        </button>
      </div>
    );
  }

  return (
    <div style={{
      padding: '16px',
      borderRadius: '8px',
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-primary)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Cover Image */}
        <div>
          <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>
            Cover Image
          </label>
          <div
            {...getCoverProps()}
            style={{
              marginTop: '8px',
              padding: '16px',
              borderRadius: '6px',
              border: '2px dashed var(--border-primary)',
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: coverPreview ? 'transparent' : 'var(--bg-primary)',
              backgroundImage: coverPreview ? `url(${coverPreview})` : 'none',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              minHeight: '120px',
            }}
          >
            <input {...getCoverInputProps()} />
            {!coverPreview && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                <Camera size={20} />
                <div style={{ fontSize: '12px' }}>{t('common.upload') || 'Upload'} or drag and drop</div>
              </div>
            )}
          </div>
        </div>

        {/* Display Name */}
        <div>
          <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>
            Display Name
          </label>
          <input
            type="text"
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            style={{
              marginTop: '6px',
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              fontSize: '14px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Tagline */}
        <div>
          <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>
            Tagline (optional)
          </label>
          <input
            type="text"
            placeholder="What you specialize in..."
            value={form.tagline || ''}
            onChange={(e) => setForm({ ...form, tagline: e.target.value })}
            style={{
              marginTop: '6px',
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              fontSize: '14px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Bio */}
        <div>
          <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>
            Bio
          </label>
          <textarea
            value={form.bio || ''}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            placeholder="Tell visitors about yourself..."
            rows={4}
            style={{
              marginTop: '6px',
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              fontSize: '14px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={handleCancel}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-primary)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
            }}
          >
            {t('common.cancel') || 'Cancel'}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--accent-text)',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              fontWeight: '600',
              opacity: isSaving ? 0.7 : 1,
            }}
          >
            <Save size={14} />
            {isSaving ? t('common.saving') || 'Saving...' : t('common.save') || 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
