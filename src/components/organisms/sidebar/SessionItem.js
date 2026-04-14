import { cn } from '@jaskier/ui';
import { useEffect, useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import { TagChip } from '@/components/molecules/TagChip';
import { AddTagButton, TagInput } from '@/components/molecules/TagInput';
import Check from '~icons/lucide/check';
import Edit2 from '~icons/lucide/edit-2';
import Loader2 from '~icons/lucide/loader-2';
import MessageSquare from '~icons/lucide/message-square';
import Trash2 from '~icons/lucide/trash-2';
import X from '~icons/lucide/x';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}
export function SessionItem({
  session,
  isActive,
  isFocused = false,
  collapsed,
  isDark,
  onSelect,
  onDelete,
  onRename,
  tags = [],
  suggestedTags = [],
  onAddTags,
  onRemoveTag,
  onTagClick,
}) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  useEffect(() => {
    if (!confirmDelete) return;
    const timer = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmDelete]);
  const handleSave = () => {
    if (editTitle.trim() && editTitle !== session.title) {
      onRename(editTitle.trim());
    }
    setIsEditing(false);
  };
  const handleCancel = () => {
    setEditTitle(session.title);
    setIsEditing(false);
  };
  const handleDeleteClick = (e) => {
    e.stopPropagation();
    if (confirmDelete) {
      onDelete();
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
    }
  };
  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') handleCancel();
  };
  // Collapsed: just an icon button
  if (collapsed) {
    return _jsx('button', {
      type: 'button',
      onClick: onSelect,
      'data-testid': 'sidebar-session-item',
      className: cn(
        'w-full p-2 rounded flex items-center justify-center transition-colors',
        isActive
          ? isDark
            ? 'bg-white/15 text-[var(--matrix-accent)]'
            : 'bg-emerald-500/15 text-[var(--matrix-accent)]'
          : isDark
            ? 'hover:bg-white/[0.08] text-[var(--matrix-text-secondary)]'
            : 'hover:bg-black/5 text-[var(--matrix-text-secondary)]',
      ),
      title: session.title,
      children: _jsx(MessageSquare, { width: 16, height: 16 }),
    });
  }
  // Editing mode
  if (isEditing) {
    return _jsxs('div', {
      className: 'flex items-center gap-1 p-1',
      children: [
        _jsx('input', {
          type: 'text',
          value: editTitle,
          onChange: (e) => setEditTitle(e.target.value),
          onKeyDown: handleEditKeyDown,
          className: 'flex-1 glass-input text-xs py-1 px-2',
          ref: (el) => el?.focus(),
        }),
        _jsx('button', {
          type: 'button',
          onClick: handleSave,
          className: cn(
            'p-1 rounded text-[var(--matrix-accent)]',
            isDark ? 'hover:bg-white/15' : 'hover:bg-black/5',
          ),
          children: _jsx(Check, { width: 14, height: 14 }),
        }),
        _jsx('button', {
          type: 'button',
          onClick: handleCancel,
          className: cn(
            'p-1 rounded',
            isDark
              ? 'hover:bg-red-500/20 text-red-400'
              : 'hover:bg-red-500/15 text-red-600',
          ),
          children: _jsx(X, { width: 14, height: 14 }),
        }),
      ],
    });
  }
  // Default: session row
  return _jsxs('div', {
    role: 'option',
    'aria-selected': isActive,
    tabIndex: 0,
    'data-testid': 'sidebar-session-item',
    className: cn(
      'group relative flex flex-col gap-0.5 p-2 rounded cursor-pointer transition-colors w-full text-left',
      isActive
        ? isDark
          ? 'bg-white/15 text-[var(--matrix-accent)]'
          : 'bg-emerald-500/15 text-[var(--matrix-accent)]'
        : isDark
          ? 'hover:bg-white/[0.08] text-[var(--matrix-text-secondary)]'
          : 'hover:bg-black/5 text-[var(--matrix-text-secondary)]',
      isFocused && 'ring-2 ring-[var(--matrix-accent)]/50',
    ),
    onClick: onSelect,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect();
      }
    },
    'aria-label': `Select session: ${session.title}`,
    onMouseEnter: () => setShowTooltip(true),
    onMouseLeave: () => setShowTooltip(false),
    children: [
      _jsxs('div', {
        className: 'flex items-center gap-2',
        children: [
          session._pending
            ? _jsx(Loader2, {
                width: 14,
                height: 14,
                className:
                  'shrink-0 animate-spin text-[var(--matrix-accent)]/60',
              })
            : _jsx(MessageSquare, {
                width: 14,
                height: 14,
                className: 'shrink-0',
              }),
          _jsxs('div', {
            className: 'flex-1 min-w-0',
            children: [
              _jsx('p', {
                className: cn(
                  'text-sm truncate',
                  session._pending && 'opacity-60 italic',
                ),
                children: session.title,
              }),
              _jsx('p', {
                className:
                  'text-xs text-[var(--matrix-text-secondary)] truncate',
                children: session._pending
                  ? t('sidebar.creating', 'Creating...')
                  : `${session.messageCount} ${session.messageCount === 1 ? t('sidebar.message', 'message') : t('sidebar.messages', 'messages')}`,
              }),
            ],
          }),
          _jsxs('div', {
            className:
              'flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity',
            children: [
              _jsx('button', {
                type: 'button',
                onClick: (e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                },
                className: cn(
                  'p-1 rounded',
                  isDark ? 'hover:bg-white/15' : 'hover:bg-black/5',
                ),
                title: t('sidebar.rename', 'Rename'),
                children: _jsx(Edit2, { width: 12, height: 12 }),
              }),
              _jsx('button', {
                type: 'button',
                onClick: handleDeleteClick,
                className: cn(
                  'p-1 rounded transition-colors',
                  confirmDelete
                    ? isDark
                      ? 'bg-red-500/30 text-red-300'
                      : 'bg-red-500/20 text-red-600'
                    : isDark
                      ? 'hover:bg-red-500/20 text-red-400'
                      : 'hover:bg-red-500/15 text-red-600',
                ),
                title: confirmDelete
                  ? t('sidebar.confirmDelete', 'Click again to delete')
                  : t('common.delete', 'Delete'),
                children: _jsx(Trash2, { width: 12, height: 12 }),
              }),
            ],
          }),
        ],
      }),
      (tags.length > 0 || isActive) &&
        !session._pending &&
        _jsxs('div', {
          className: 'flex items-center gap-1 flex-wrap ml-5 mt-0.5',
          children: [
            tags.map((tag) =>
              _jsx(
                TagChip,
                {
                  tag: tag,
                  isDark: isDark,
                  removable: isActive,
                  onRemove: () => onRemoveTag?.(tag),
                  onClick: onTagClick ? () => onTagClick(tag) : undefined,
                },
                tag,
              ),
            ),
            isActive &&
              onAddTags &&
              !showTagInput &&
              _jsx(AddTagButton, {
                isDark: isDark,
                onClick: () => setShowTagInput(true),
              }),
          ],
        }),
      showTagInput &&
        isActive &&
        _jsx('div', {
          className: 'ml-5 mt-0.5',
          children: _jsx(TagInput, {
            existingTags: tags,
            suggestedTags: suggestedTags,
            onSubmit: (newTags) => {
              onAddTags?.(newTags);
              setShowTagInput(false);
            },
            onCancel: () => setShowTagInput(false),
            isDark: isDark,
          }),
        }),
      showTooltip &&
        session.preview &&
        _jsxs('div', {
          className: cn(
            'absolute left-full top-0 ml-2 z-50 w-56 p-2.5 rounded-lg',
            isDark
              ? 'bg-[var(--matrix-bg-primary)]/95 border border-white/20'
              : 'bg-[var(--matrix-bg-primary)]/95 border border-black/10',
            'shadow-lg shadow-black/40 backdrop-blur-sm pointer-events-none',
            'animate-fade-in',
          ),
          children: [
            _jsx('p', {
              className:
                'text-[11px] text-[var(--matrix-text-primary)] font-medium truncate mb-1',
              children: session.title,
            }),
            _jsx('p', {
              className:
                'text-[10px] text-[var(--matrix-text-secondary)] line-clamp-3 leading-relaxed',
              children: session.preview,
            }),
            _jsxs('div', {
              className:
                'flex items-center justify-between mt-1.5 pt-1.5 border-t border-[var(--matrix-border)]',
              children: [
                _jsxs('span', {
                  className: 'text-[9px] text-[var(--matrix-text-secondary)]',
                  children: [
                    session.messageCount,
                    ' ',
                    session.messageCount === 1
                      ? t('sidebar.message', 'message')
                      : t('sidebar.messages', 'messages'),
                  ],
                }),
                _jsx('span', {
                  className: 'text-[9px] text-[var(--matrix-accent)]',
                  children: timeAgo(session.updatedAt ?? session.createdAt),
                }),
              ],
            }),
            tags.length > 0 &&
              _jsx('div', {
                className:
                  'flex flex-wrap gap-1 mt-1.5 pt-1 border-t border-[var(--matrix-border)]',
                children: tags.map((tag) =>
                  _jsx(TagChip, { tag: tag, isDark: isDark, size: 'xs' }, tag),
                ),
              }),
          ],
        }),
    ],
  });
}
