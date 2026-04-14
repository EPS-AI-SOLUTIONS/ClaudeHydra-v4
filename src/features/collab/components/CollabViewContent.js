import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useTranslation } from 'react-i18next';
import Activity from '~icons/lucide/activity';
import FileText from '~icons/lucide/file-text';
import Plug from '~icons/lucide/plug';
import PlugZap from '~icons/lucide/plug-zap';
import Redo2 from '~icons/lucide/redo-2';
import Undo2 from '~icons/lucide/undo-2';
import Users from '~icons/lucide/users';
import { useCollabDocument } from '../hooks/useCollabDocument';
import { useCollabStats } from '../hooks/useCollabStats';
import { CollabCursors } from './CollabCursors';
import { CollabStatusBadge } from './CollabStatusBadge';
/**
 * CollabView — CRDT Real-time Collaboration dashboard.
 *
 * Features:
 * - Live collaborative text editor (Yjs CRDT)
 * - Peer awareness (cursor positions, user names, AI badges)
 * - Isolated undo/redo per session (Y.UndoManager)
 * - Room statistics and monitoring
 * - Connect/disconnect controls
 */
export default function CollabViewContent() {
  const { t } = useTranslation();
  const [docKey, setDocKey] = useState('default-session');
  const textareaRef = useRef(null);
  const {
    content,
    peers,
    status,
    applyChange,
    connect,
    disconnect,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useCollabDocument({
    appId: 'claudehydra',
    docKey,
    userName: 'Claude User',
    userColor: '#6366f1',
    autoConnect: true,
  });
  const { data: stats } = useCollabStats();
  const handleTextChange = useCallback(
    (e) => {
      const newValue = e.target.value;
      const oldValue = content;
      // Find the diff position
      let start = 0;
      while (
        start < oldValue.length &&
        start < newValue.length &&
        oldValue[start] === newValue[start]
      ) {
        start++;
      }
      let oldEnd = oldValue.length;
      let newEnd = newValue.length;
      while (
        oldEnd > start &&
        newEnd > start &&
        oldValue[oldEnd - 1] === newValue[newEnd - 1]
      ) {
        oldEnd--;
        newEnd--;
      }
      const deleteCount = oldEnd - start;
      const insertText = newValue.slice(start, newEnd);
      applyChange(start, deleteCount, insertText);
    },
    [content, applyChange],
  );
  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (e.ctrlKey && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);
  return _jsxs(motion.div, {
    className: 'flex h-full flex-col gap-4 p-4',
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.2 },
    children: [
      _jsxs('div', {
        className: 'flex items-center justify-between',
        children: [
          _jsxs('div', {
            className: 'flex items-center gap-3',
            children: [
              _jsx(Users, { className: 'h-5 w-5 text-indigo-400' }),
              _jsx('h1', {
                className: 'text-lg font-semibold text-zinc-100',
                children: t('collab.title'),
              }),
              _jsx('span', {
                className:
                  'rounded bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-400',
                children: t('collab.crdt'),
              }),
            ],
          }),
          _jsxs('div', {
            className: 'flex items-center gap-3',
            children: [
              _jsx(CollabStatusBadge, {
                status: status,
                peerCount: peers.length,
              }),
              status === 'connected'
                ? _jsxs('button', {
                    type: 'button',
                    onClick: disconnect,
                    className:
                      'flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors',
                    children: [
                      _jsx(PlugZap, { className: 'h-3.5 w-3.5' }),
                      t('collab.disconnect'),
                    ],
                  })
                : _jsxs('button', {
                    type: 'button',
                    onClick: connect,
                    className:
                      'flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/20 transition-colors',
                    children: [
                      _jsx(Plug, { className: 'h-3.5 w-3.5' }),
                      t('collab.connect'),
                    ],
                  }),
            ],
          }),
        ],
      }),
      _jsxs('div', {
        className: 'flex items-center gap-2',
        children: [
          _jsx(FileText, { className: 'h-4 w-4 text-zinc-500' }),
          _jsx('label', {
            htmlFor: 'doc-key-input',
            className: 'text-xs text-zinc-500',
            children: t('collab.document'),
          }),
          _jsx('input', {
            id: 'doc-key-input',
            type: 'text',
            value: docKey,
            onChange: (e) => setDocKey(e.target.value),
            className:
              'rounded-md border border-zinc-700 bg-zinc-800/50 px-2 py-1 text-xs text-zinc-300 focus:border-indigo-500 focus:outline-none',
            placeholder: t('collab.docKeyPlaceholder'),
          }),
        ],
      }),
      _jsxs('div', {
        className: 'flex flex-1 gap-4 min-h-0',
        children: [
          _jsxs('div', {
            className:
              'flex flex-1 flex-col rounded-lg border border-zinc-700/50 bg-zinc-900/50',
            children: [
              _jsxs('div', {
                className:
                  'flex items-center gap-2 border-b border-zinc-700/50 px-3 py-2',
                children: [
                  _jsx('button', {
                    type: 'button',
                    onClick: undo,
                    disabled: !canUndo,
                    className:
                      'rounded p-1 text-zinc-400 hover:bg-zinc-700/50 disabled:opacity-30',
                    title: 'Undo (Ctrl+Z)',
                    children: _jsx(Undo2, { className: 'h-4 w-4' }),
                  }),
                  _jsx('button', {
                    type: 'button',
                    onClick: redo,
                    disabled: !canRedo,
                    className:
                      'rounded p-1 text-zinc-400 hover:bg-zinc-700/50 disabled:opacity-30',
                    title: 'Redo (Ctrl+Y)',
                    children: _jsx(Redo2, { className: 'h-4 w-4' }),
                  }),
                  _jsx('div', { className: 'mx-2 h-4 w-px bg-zinc-700' }),
                  _jsxs('span', {
                    className: 'text-xs text-zinc-600',
                    children: [content.length, ' ', t('collab.chars')],
                  }),
                ],
              }),
              _jsx(CollabCursors, { peers: peers }),
              _jsx('textarea', {
                ref: textareaRef,
                value: content,
                onChange: handleTextChange,
                className:
                  'flex-1 resize-none bg-transparent p-4 font-mono text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none',
                placeholder: t('collab.startTyping'),
                spellCheck: false,
              }),
            ],
          }),
          _jsxs('div', {
            className:
              'w-64 shrink-0 rounded-lg border border-zinc-700/50 bg-zinc-900/50 p-4',
            children: [
              _jsxs('div', {
                className: 'flex items-center gap-2 mb-4',
                children: [
                  _jsx(Activity, { className: 'h-4 w-4 text-zinc-400' }),
                  _jsx('h2', {
                    className: 'text-sm font-medium text-zinc-300',
                    children: t('collab.roomStats'),
                  }),
                ],
              }),
              stats
                ? _jsxs('div', {
                    className: 'space-y-3 text-xs',
                    children: [
                      _jsxs('div', {
                        className: 'flex justify-between text-zinc-400',
                        children: [
                          _jsx('span', { children: t('collab.activeRooms') }),
                          _jsx('span', {
                            className: 'text-zinc-200',
                            children: stats.active_rooms,
                          }),
                        ],
                      }),
                      _jsxs('div', {
                        className: 'flex justify-between text-zinc-400',
                        children: [
                          _jsx('span', { children: t('collab.totalPeers') }),
                          _jsx('span', {
                            className: 'text-zinc-200',
                            children: stats.total_peers,
                          }),
                        ],
                      }),
                      _jsxs('div', {
                        className: 'flex justify-between text-zinc-400',
                        children: [
                          _jsx('span', { children: t('collab.documents') }),
                          _jsx('span', {
                            className: 'text-zinc-200',
                            children: stats.total_documents,
                          }),
                        ],
                      }),
                      stats.rooms.length > 0 &&
                        _jsxs('div', {
                          className: 'mt-4 space-y-2',
                          children: [
                            _jsx('h3', {
                              className: 'text-zinc-500 font-medium',
                              children: t('collab.rooms'),
                            }),
                            stats.rooms.map((room) =>
                              _jsxs(
                                'div',
                                {
                                  className:
                                    'rounded-md border border-zinc-700/50 bg-zinc-800/30 p-2',
                                  children: [
                                    _jsx('div', {
                                      className:
                                        'truncate text-zinc-300 font-mono',
                                      children: room.room_key,
                                    }),
                                    _jsxs('div', {
                                      className:
                                        'mt-1 flex gap-3 text-zinc-500',
                                      children: [
                                        _jsxs('span', {
                                          children: [room.peer_count, ' peers'],
                                        }),
                                        _jsxs('span', {
                                          children: ['v', room.version],
                                        }),
                                        _jsxs('span', {
                                          children: [
                                            (
                                              room.document_size_bytes / 1024
                                            ).toFixed(1),
                                            'KB',
                                          ],
                                        }),
                                      ],
                                    }),
                                  ],
                                },
                                room.room_key,
                              ),
                            ),
                          ],
                        }),
                    ],
                  })
                : _jsx('p', {
                    className: 'text-xs text-zinc-600',
                    children: t('collab.loadingStats'),
                  }),
            ],
          }),
        ],
      }),
    ],
  });
}
