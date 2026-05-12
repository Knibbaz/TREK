import { useState } from 'react';
import { ChevronUp, ChevronDown, Eye, EyeOff, Trash2, Edit, Plus } from 'lucide-react';
import { useCreatorHubStore } from '../../../store/creatorHubStore';
import { creatorHubApi } from '../../../api/client';
import { useToast } from '../../shared/Toast';
import { useTranslation } from '../../../i18n';
import { LibBlock } from '../../../types';
import './lib-themes.css';

const BLOCK_TYPES = [
  { value: 'link', label: 'Link', icon: '🔗' },
  { value: 'heading', label: 'Heading', icon: '📝' },
  { value: 'divider', label: 'Divider', icon: '──' },
  { value: 'text', label: 'Text', icon: '📄' },
  { value: 'image', label: 'Image', icon: '🖼️' },
  { value: 'embed', label: 'Embed', icon: '📺' },
  { value: 'listings_grid', label: 'Listings', icon: '🏕️' },
  { value: 'guides_grid', label: 'Guides', icon: '📍' },
  { value: 'group_trip', label: 'Group Trip', icon: '🏝️' },
  { value: 'social_grid', label: 'Social', icon: '📱' },
  { value: 'tip_jar', label: 'Tip Jar', icon: '☕' },
  { value: 'email_signup', label: 'Email Signup', icon: '📧' },
  { value: 'affiliate_featured', label: 'Affiliates', icon: '💰' },
];

export function LiBBlockEditor() {
  const { t } = useTranslation();
  const { blocks, isSaving, error, updateBlock, removeBlock, reorderBlocks, addBlock } = useCreatorHubStore();
  const { success, error: showError } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<LibBlock>>({});
  const [showTypeMenu, setShowTypeMenu] = useState(false);

  const handleAddBlock = async (type: string) => {
    try {
      const newBlock = await creatorHubApi.createBlock({ type, title: '', url: '', icon: '', content: {} });
      addBlock(newBlock);
      setShowTypeMenu(false);
      success('Block added');
    } catch (err: any) {
      showError(err?.response?.data?.error || 'Failed to add block');
    }
  };

  const handleStartEdit = (block: LibBlock) => {
    setEditingId(block.id);
    setFormData(block);
  };

  const handleSaveBlock = async () => {
    if (!editingId) return;
    try {
      const updated = await creatorHubApi.updateBlock(editingId, formData);
      updateBlock(editingId, updated);
      setEditingId(null);
      success('Block saved');
    } catch (err: any) {
      showError(err?.response?.data?.error || 'Failed to save block');
    }
  };

  const handleDeleteBlock = async (id: string) => {
    if (!confirm('Delete this block?')) return;
    try {
      await creatorHubApi.deleteBlock(id);
      removeBlock(id);
      success('Block deleted');
    } catch (err: any) {
      showError(err?.response?.data?.error || 'Failed to delete block');
    }
  };

  const handleReorder = async (blocks: LibBlock[]) => {
    try {
      const order = blocks.map((b, idx) => ({ id: b.id, sort_order: idx }));
      await creatorHubApi.reorderBlocks(order);
      reorderBlocks(blocks);
      success('Order saved');
    } catch (err: any) {
      showError(err?.response?.data?.error || 'Failed to reorder blocks');
    }
  };

  const moveBlock = (id: string, direction: 'up' | 'down') => {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;

    const newBlocks = [...blocks];
    if (direction === 'up' && idx > 0) {
      [newBlocks[idx], newBlocks[idx - 1]] = [newBlocks[idx - 1], newBlocks[idx]];
    } else if (direction === 'down' && idx < newBlocks.length - 1) {
      [newBlocks[idx], newBlocks[idx + 1]] = [newBlocks[idx + 1], newBlocks[idx]];
    } else {
      return;
    }

    handleReorder(newBlocks);
  };

  const toggleVisibility = async (block: LibBlock) => {
    try {
      const updated = await creatorHubApi.updateBlock(block.id, { is_visible: !block.is_visible });
      updateBlock(block.id, updated);
    } catch (err: any) {
      showError(err?.response?.data?.error || 'Failed to toggle visibility');
    }
  };

  const sortedBlocks = [...blocks].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div style={{ padding: '1rem' }}>
      {/* Add Block Button */}
      <div style={{ marginBottom: '1.5rem', position: 'relative' }}>
        <button
          onClick={() => setShowTypeMenu(!showTypeMenu)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: 600,
          }}
        >
          <Plus size={18} /> Add Block
        </button>

        {showTypeMenu && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '0.5rem',
              backgroundColor: 'white',
              border: '1px solid var(--border-primary)',
              borderRadius: '0.5rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              zIndex: 100,
              minWidth: '250px',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0' }}>
              {BLOCK_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => handleAddBlock(type.value)}
                  style={{
                    padding: '0.75rem',
                    border: 'none',
                    borderBottom: '1px solid var(--border-primary)',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '0.85rem',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <span style={{ marginRight: '0.5rem' }}>{type.icon}</span>
                  {type.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Block List */}
      {sortedBlocks.length === 0 ? (
        <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          No blocks yet. Add one to get started!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {sortedBlocks.map((block, idx) => (
            <div key={block.id}>
              {editingId === block.id ? (
                <BlockEditForm
                  block={block}
                  formData={formData}
                  setFormData={setFormData}
                  onSave={handleSaveBlock}
                  onCancel={() => setEditingId(null)}
                  isSaving={isSaving}
                />
              ) : (
                <BlockListItem
                  block={block}
                  isFirst={idx === 0}
                  isLast={idx === sortedBlocks.length - 1}
                  onEdit={() => handleStartEdit(block)}
                  onDelete={() => handleDeleteBlock(block.id)}
                  onToggleVisibility={() => toggleVisibility(block)}
                  onMoveUp={() => moveBlock(block.id, 'up')}
                  onMoveDown={() => moveBlock(block.id, 'down')}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BlockListItem({
  block,
  isFirst,
  isLast,
  onEdit,
  onDelete,
  onToggleVisibility,
  onMoveUp,
  onMoveDown,
}: {
  block: LibBlock;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleVisibility: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const blockType = BLOCK_TYPES.find((t) => t.value === block.type);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '1rem',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: '0.5rem',
        transition: 'all 0.2s',
      }}
    >
      {/* Type + Title */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          <span style={{ marginRight: '0.5rem' }}>{blockType?.icon}</span>
          {blockType?.label}
        </div>
        <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {block.title || '(untitled)'}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {/* Visibility toggle */}
        <button
          onClick={onToggleVisibility}
          title={block.is_visible ? 'Hide' : 'Show'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0.5rem',
            color: block.is_visible ? 'var(--accent)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {block.is_visible ? <Eye size={18} /> : <EyeOff size={18} />}
        </button>

        {/* Reorder */}
        {!isFirst && (
          <button
            onClick={onMoveUp}
            title="Move up"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.5rem',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ChevronUp size={18} />
          </button>
        )}
        {!isLast && (
          <button
            onClick={onMoveDown}
            title="Move down"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.5rem',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ChevronDown size={18} />
          </button>
        )}

        {/* Edit */}
        <button
          onClick={onEdit}
          title="Edit"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0.5rem',
            color: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Edit size={18} />
        </button>

        {/* Delete */}
        <button
          onClick={onDelete}
          title="Delete"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0.5rem',
            color: '#d32f2f',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
}

function BlockEditForm({
  block,
  formData,
  setFormData,
  onSave,
  onCancel,
  isSaving,
}: {
  block: LibBlock;
  formData: Partial<LibBlock>;
  setFormData: (data: Partial<LibBlock>) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const blockType = BLOCK_TYPES.find((t) => t.value === block.type);

  return (
    <div
      style={{
        padding: '1rem',
        backgroundColor: 'white',
        border: '2px solid var(--accent)',
        borderRadius: '0.5rem',
      }}
    >
      <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        {blockType?.icon} {blockType?.label}
      </div>

      {/* Title field */}
      {(block.type === 'link' || block.type === 'text' || block.type === 'heading') && (
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
            {block.type === 'heading' ? 'Heading' : 'Title'}
          </label>
          <input
            type="text"
            value={formData.title || ''}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid var(--border-primary)',
              borderRadius: '0.25rem',
              fontSize: '0.95rem',
              boxSizing: 'border-box',
            }}
            placeholder="Enter title"
          />
        </div>
      )}

      {/* URL field */}
      {block.type === 'link' && (
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
            URL
          </label>
          <input
            type="url"
            value={formData.url || ''}
            onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid var(--border-primary)',
              borderRadius: '0.25rem',
              fontSize: '0.95rem',
              boxSizing: 'border-box',
            }}
            placeholder="https://example.com"
          />
        </div>
      )}

      {/* Icon field */}
      {(block.type === 'link' || block.type === 'heading') && (
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
            Icon (emoji)
          </label>
          <input
            type="text"
            value={formData.icon || ''}
            onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid var(--border-primary)',
              borderRadius: '0.25rem',
              fontSize: '0.95rem',
              boxSizing: 'border-box',
            }}
            placeholder="🔗"
            maxLength={2}
          />
        </div>
      )}

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={onSave}
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
          onClick={onCancel}
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
  );
}
