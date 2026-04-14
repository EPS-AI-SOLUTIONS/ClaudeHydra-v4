import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useState } from 'react';
import {
  Fragment as _Fragment,
  jsx as _jsx,
  jsxs as _jsxs,
} from 'react/jsx-runtime';
/**
 * SandboxPanel — Isolated code execution environment for AI agents
 *
 * Provides a code editor, language selector, execution controls, and output
 * display. Integrates with the Swarm for CI-like test-before-apply workflows.
 */
import Box from '~icons/lucide/box';
import CheckCircle2 from '~icons/lucide/check-circle-2';
import Clock from '~icons/lucide/clock';
import Container from '~icons/lucide/container';
import Loader2 from '~icons/lucide/loader-2';
import Play from '~icons/lucide/play';
import Plus from '~icons/lucide/plus';
import Shield from '~icons/lucide/shield';
import Trash2 from '~icons/lucide/trash-2';
import XCircle from '~icons/lucide/x-circle';
import { useSandbox } from '../hooks/useSandbox';

// ── Language Config ──────────────────────────────────────────────────────────
const LANGUAGES = [
  { id: 'node', label: 'Node.js', color: '#22c55e', icon: 'JS' },
  { id: 'python', label: 'Python', color: '#3b82f6', icon: 'PY' },
  { id: 'rust', label: 'Rust', color: '#f59e0b', icon: 'RS' },
  { id: 'bash', label: 'Bash', color: '#a855f7', icon: 'SH' },
];
const EXAMPLE_CODE = {
  node: `const data = [3, 1, 4, 1, 5, 9, 2, 6];
const sorted = [...data].sort((a, b) => a - b);
console.log('Sorted:', sorted);
console.log('Sum:', data.reduce((a, b) => a + b, 0));`,
  python: `data = [3, 1, 4, 1, 5, 9, 2, 6]
print(f"Sorted: {sorted(data)}")
print(f"Sum: {sum(data)}")
print(f"Mean: {sum(data)/len(data):.2f}")`,
  rust: `fn main() {
    let data = vec![3, 1, 4, 1, 5, 9, 2, 6];
    let sum: i32 = data.iter().sum();
    println!("Sum: {}", sum);
    println!("Count: {}", data.len());
}`,
  bash: `echo "System info:"
uname -a
echo "---"
echo "Files in /tmp:"
ls -la /tmp/ 2>/dev/null || echo "(empty)"`,
};
// ── Main Component ───────────────────────────────────────────────────────────
export function SandboxPanel() {
  const {
    sessions,
    executions,
    health,
    stats,
    latestExecution,
    isCreating,
    isExecuting,
    createSession,
    executeCode,
    destroySession,
  } = useSandbox();
  const [language, setLanguage] = useState('node');
  const [code, setCode] = useState(EXAMPLE_CODE.node);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [showSessions, setShowSessions] = useState(false);
  // ── Execute handler ──────────────────────────────────────────────────────
  const handleExecute = useCallback(async () => {
    if (!code.trim()) return;
    await executeCode(code, language, activeSessionId ?? undefined);
  }, [code, language, activeSessionId, executeCode]);
  // ── Create session handler ───────────────────────────────────────────────
  const handleCreateSession = useCallback(async () => {
    const session = await createSession(language);
    if (session) {
      setActiveSessionId(session.id);
    }
  }, [language, createSession]);
  // ── Language change ──────────────────────────────────────────────────────
  const handleLanguageChange = useCallback((lang) => {
    setLanguage(lang);
    setCode(EXAMPLE_CODE[lang]);
    setActiveSessionId(null); // Clear session when language changes
  }, []);
  return _jsxs('div', {
    style: { display: 'flex', height: '100%', background: '#0a0a0f' },
    children: [
      _jsxs('div', {
        style: {
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        },
        children: [
          _jsxs('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 16px',
              borderBottom: '1px solid #1e293b',
              background: '#0f172a',
            },
            children: [
              _jsxs('div', {
                style: { display: 'flex', alignItems: 'center', gap: '6px' },
                children: [
                  _jsx(Shield, { width: 16, height: 16, color: '#10b981' }),
                  _jsx('span', {
                    style: {
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#e2e8f0',
                    },
                    children: 'Sandbox',
                  }),
                ],
              }),
              _jsx('div', {
                style: { width: '1px', height: '20px', background: '#334155' },
              }),
              _jsxs('div', {
                style: { display: 'flex', alignItems: 'center', gap: '4px' },
                children: [
                  _jsx(Container, {
                    width: 14,
                    height: 14,
                    color: health?.docker_available ? '#22c55e' : '#f59e0b',
                  }),
                  _jsx('span', {
                    style: { fontSize: '11px', color: '#94a3b8' },
                    children: health?.docker_available ? 'Docker' : 'Fallback',
                  }),
                ],
              }),
              _jsxs('span', {
                style: { fontSize: '11px', color: '#64748b' },
                children: [
                  stats.activeSessions,
                  ' sessions \u00B7 ',
                  stats.totalExecutions,
                  ' runs \u00B7',
                  ' ',
                  stats.successRate,
                  '% pass',
                ],
              }),
              _jsx('div', { style: { flex: 1 } }),
              _jsxs('button', {
                type: 'button',
                onClick: () => setShowSessions(!showSessions),
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  background: showSessions ? '#1e293b' : 'transparent',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#94a3b8',
                  fontSize: '11px',
                  cursor: 'pointer',
                },
                children: [
                  _jsx(Box, { width: 12, height: 12 }),
                  'Sessions (',
                  sessions.length,
                  ')',
                ],
              }),
            ],
          }),
          _jsxs('div', {
            style: {
              display: 'flex',
              gap: '6px',
              padding: '8px 16px',
              borderBottom: '1px solid #1e293b',
            },
            children: [
              LANGUAGES.map((lang) =>
                _jsxs(
                  'button',
                  {
                    type: 'button',
                    onClick: () => handleLanguageChange(lang.id),
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '5px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: language === lang.id ? 600 : 400,
                      border: `1px solid ${language === lang.id ? lang.color : '#334155'}`,
                      background:
                        language === lang.id
                          ? `${lang.color}15`
                          : 'transparent',
                      color: language === lang.id ? lang.color : '#94a3b8',
                      cursor: 'pointer',
                    },
                    children: [
                      _jsx('span', {
                        style: {
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '1px 4px',
                          borderRadius: '3px',
                          background:
                            language === lang.id
                              ? `${lang.color}30`
                              : '#1e293b',
                          color: language === lang.id ? lang.color : '#64748b',
                        },
                        children: lang.icon,
                      }),
                      lang.label,
                    ],
                  },
                  lang.id,
                ),
              ),
              _jsx('div', { style: { flex: 1 } }),
              activeSessionId &&
                _jsxs('div', {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    background: '#052e16',
                    border: '1px solid #22c55e33',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: '#22c55e',
                  },
                  children: [
                    _jsx(Container, { width: 12, height: 12 }),
                    'Session active',
                    _jsx('button', {
                      type: 'button',
                      onClick: () => setActiveSessionId(null),
                      style: {
                        background: 'none',
                        border: 'none',
                        color: '#22c55e',
                        cursor: 'pointer',
                        padding: '0 2px',
                        fontSize: '14px',
                      },
                      children: '\u00D7',
                    }),
                  ],
                }),
              _jsxs('button', {
                type: 'button',
                onClick: handleCreateSession,
                disabled: isCreating,
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#e2e8f0',
                  fontSize: '11px',
                  cursor: 'pointer',
                },
                children: [
                  isCreating
                    ? _jsx(Loader2, {
                        width: 12,
                        height: 12,
                        className: 'animate-spin',
                      })
                    : _jsx(Plus, { width: 12, height: 12 }),
                  'New Session',
                ],
              }),
            ],
          }),
          _jsxs('div', {
            style: {
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            },
            children: [
              _jsx('textarea', {
                value: code,
                onChange: (e) => setCode(e.target.value),
                placeholder: 'Enter code to execute in sandbox...',
                spellCheck: false,
                style: {
                  flex: 1,
                  width: '100%',
                  background: '#0a0a0f',
                  color: '#e2e8f0',
                  border: 'none',
                  padding: '16px',
                  fontSize: '13px',
                  fontFamily:
                    "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                  lineHeight: 1.6,
                  resize: 'none',
                  outline: 'none',
                  tabSize: 2,
                },
                onKeyDown: (e) => {
                  // Ctrl+Enter to execute
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleExecute();
                  }
                  // Tab inserts spaces
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const target = e.target;
                    const start = target.selectionStart;
                    const end = target.selectionEnd;
                    setCode(
                      `${code.substring(0, start)}  ${code.substring(end)}`,
                    );
                    // Restore cursor position after React re-render
                    requestAnimationFrame(() => {
                      target.selectionStart = target.selectionEnd = start + 2;
                    });
                  }
                },
              }),
              _jsxs('div', {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderTop: '1px solid #1e293b',
                  background: '#0f172a',
                },
                children: [
                  _jsx('button', {
                    type: 'button',
                    onClick: handleExecute,
                    disabled: isExecuting || !code.trim(),
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 16px',
                      background: isExecuting ? '#1e293b' : '#10b981',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: isExecuting ? 'not-allowed' : 'pointer',
                    },
                    children: isExecuting
                      ? _jsxs(_Fragment, {
                          children: [
                            _jsx(Loader2, {
                              width: 14,
                              height: 14,
                              className: 'animate-spin',
                            }),
                            'Running...',
                          ],
                        })
                      : _jsxs(_Fragment, {
                          children: [
                            _jsx(Play, { width: 14, height: 14 }),
                            'Run (Ctrl+Enter)',
                          ],
                        }),
                  }),
                  _jsxs('span', {
                    style: { fontSize: '11px', color: '#64748b' },
                    children: [
                      code.length,
                      ' chars \u00B7 ',
                      language,
                      activeSessionId
                        ? ' · persistent session'
                        : ' · ephemeral',
                    ],
                  }),
                ],
              }),
            ],
          }),
          _jsx(AnimatePresence, {
            children:
              latestExecution &&
              _jsx(motion.div, {
                initial: { height: 0, opacity: 0 },
                animate: { height: 'auto', opacity: 1 },
                exit: { height: 0, opacity: 0 },
                style: {
                  borderTop: '1px solid #1e293b',
                  background: '#0f172a',
                  maxHeight: '300px',
                  overflow: 'auto',
                },
                children: _jsx(ExecutionOutput, { execution: latestExecution }),
              }),
          }),
        ],
      }),
      _jsx(AnimatePresence, {
        children:
          showSessions &&
          _jsx(motion.div, {
            initial: { width: 0, opacity: 0 },
            animate: { width: 280, opacity: 1 },
            exit: { width: 0, opacity: 0 },
            style: {
              borderLeft: '1px solid #1e293b',
              background: '#0f172a',
              overflow: 'auto',
            },
            children: _jsxs('div', {
              style: { padding: '12px' },
              children: [
                _jsx('div', {
                  style: {
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#e2e8f0',
                    marginBottom: '10px',
                  },
                  children: 'Sandbox Sessions',
                }),
                sessions.length === 0
                  ? _jsx('div', {
                      style: {
                        fontSize: '12px',
                        color: '#64748b',
                        textAlign: 'center',
                        padding: '20px 0',
                      },
                      children:
                        'No active sessions. Click "New Session" to create one.',
                    })
                  : sessions.map((session) =>
                      _jsx(
                        SessionCard,
                        {
                          session: session,
                          isActive: session.id === activeSessionId,
                          onSelect: () => {
                            setActiveSessionId(session.id);
                            setLanguage(session.language);
                          },
                          onDestroy: () => {
                            destroySession(session.id);
                            if (activeSessionId === session.id) {
                              setActiveSessionId(null);
                            }
                          },
                        },
                        session.id,
                      ),
                    ),
                _jsx('div', {
                  style: {
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#e2e8f0',
                    marginTop: '16px',
                    marginBottom: '10px',
                  },
                  children: 'Recent Executions',
                }),
                executions
                  .slice(0, 20)
                  .map((exec) =>
                    _jsx(ExecutionRow, { execution: exec }, exec.id),
                  ),
              ],
            }),
          }),
      }),
    ],
  });
}
// ── Sub-components ───────────────────────────────────────────────────────────
function ExecutionOutput({ execution }) {
  const isSuccess = execution.status === 'success';
  const isTimeout = execution.status === 'timeout';
  return _jsxs('div', {
    style: { padding: '12px 16px' },
    children: [
      _jsxs('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '8px',
        },
        children: [
          isSuccess
            ? _jsx(CheckCircle2, { width: 14, height: 14, color: '#22c55e' })
            : isTimeout
              ? _jsx(Clock, { width: 14, height: 14, color: '#f59e0b' })
              : _jsx(XCircle, { width: 14, height: 14, color: '#ef4444' }),
          _jsx('span', {
            style: {
              fontSize: '12px',
              fontWeight: 600,
              color: isSuccess ? '#22c55e' : isTimeout ? '#f59e0b' : '#ef4444',
            },
            children: isSuccess ? 'Success' : isTimeout ? 'Timeout' : 'Error',
          }),
          _jsxs('span', {
            style: { fontSize: '11px', color: '#64748b' },
            children: [
              'exit: ',
              execution.exit_code ?? '—',
              ' \u00B7 ',
              execution.duration_ms,
              'ms \u00B7',
              ' ',
              execution.language,
            ],
          }),
        ],
      }),
      execution.stdout &&
        _jsxs('div', {
          style: { marginBottom: '8px' },
          children: [
            _jsx('div', {
              style: {
                fontSize: '10px',
                color: '#64748b',
                marginBottom: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              },
              children: 'stdout',
            }),
            _jsx('pre', {
              style: {
                background: '#0a0a0f',
                border: '1px solid #1e293b',
                borderLeft: '3px solid #22c55e',
                borderRadius: '4px',
                padding: '8px 12px',
                fontSize: '12px',
                fontFamily: "'JetBrains Mono', monospace",
                color: '#e2e8f0',
                whiteSpace: 'pre-wrap',
                margin: 0,
                maxHeight: '150px',
                overflow: 'auto',
              },
              children: execution.stdout,
            }),
          ],
        }),
      execution.stderr &&
        _jsxs('div', {
          children: [
            _jsx('div', {
              style: {
                fontSize: '10px',
                color: '#64748b',
                marginBottom: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              },
              children: 'stderr',
            }),
            _jsx('pre', {
              style: {
                background: '#0a0a0f',
                border: '1px solid #1e293b',
                borderLeft: '3px solid #ef4444',
                borderRadius: '4px',
                padding: '8px 12px',
                fontSize: '12px',
                fontFamily: "'JetBrains Mono', monospace",
                color: '#f87171',
                whiteSpace: 'pre-wrap',
                margin: 0,
                maxHeight: '150px',
                overflow: 'auto',
              },
              children: execution.stderr,
            }),
          ],
        }),
    ],
  });
}
function SessionCard({ session, isActive, onSelect, onDestroy }) {
  const langConfig = LANGUAGES.find((l) => l.id === session.language);
  return _jsxs('button', {
    type: 'button',
    style: {
      padding: '8px 10px',
      marginBottom: '6px',
      background: isActive ? '#1e293b' : '#0f172a',
      border: `1px solid ${isActive ? '#3b82f6' : '#1e293b'}`,
      borderRadius: '8px',
      cursor: 'pointer',
      width: '100%',
      textAlign: 'left',
      color: 'inherit',
    },
    onClick: onSelect,
    children: [
      _jsxs('div', {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        children: [
          _jsxs('div', {
            style: { display: 'flex', alignItems: 'center', gap: '6px' },
            children: [
              _jsx('span', {
                style: {
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '1px 4px',
                  borderRadius: '3px',
                  background: `${langConfig?.color ?? '#6b7280'}30`,
                  color: langConfig?.color ?? '#6b7280',
                },
                children: langConfig?.icon ?? '?',
              }),
              _jsx('span', {
                style: {
                  fontSize: '12px',
                  color: '#e2e8f0',
                  fontWeight: isActive ? 600 : 400,
                },
                children: session.id.slice(0, 8),
              }),
            ],
          }),
          _jsxs('div', {
            style: { display: 'flex', alignItems: 'center', gap: '4px' },
            children: [
              _jsx('span', {
                style: {
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background:
                    session.status === 'ready' ? '#22c55e' : '#6b7280',
                },
              }),
              _jsx('button', {
                type: 'button',
                onClick: (e) => {
                  e.stopPropagation();
                  onDestroy();
                },
                style: {
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                },
                children: _jsx(Trash2, { width: 12, height: 12 }),
              }),
            ],
          }),
        ],
      }),
      _jsxs('div', {
        style: { fontSize: '10px', color: '#64748b', marginTop: '3px' },
        children: [
          session.execution_count,
          ' runs',
          session.container_id ? ' · Docker' : ' · fallback',
          session.resource_limits.memory_mb &&
            ` · ${session.resource_limits.memory_mb}MB`,
        ],
      }),
    ],
  });
}
function ExecutionRow({ execution }) {
  const isSuccess = execution.status === 'success';
  const langConfig = LANGUAGES.find((l) => l.id === execution.language);
  return _jsxs('div', {
    style: {
      padding: '6px 8px',
      marginBottom: '4px',
      borderRadius: '6px',
      background: '#1e293b',
      borderLeft: `2px solid ${isSuccess ? '#22c55e' : '#ef4444'}`,
    },
    children: [
      _jsxs('div', {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        children: [
          _jsxs('div', {
            style: { display: 'flex', alignItems: 'center', gap: '4px' },
            children: [
              isSuccess
                ? _jsx(CheckCircle2, {
                    width: 10,
                    height: 10,
                    color: '#22c55e',
                  })
                : _jsx(XCircle, { width: 10, height: 10, color: '#ef4444' }),
              _jsx('span', {
                style: {
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '0px 3px',
                  borderRadius: '2px',
                  background: `${langConfig?.color ?? '#6b7280'}20`,
                  color: langConfig?.color ?? '#6b7280',
                },
                children: langConfig?.icon ?? '?',
              }),
            ],
          }),
          _jsxs('span', {
            style: { fontSize: '10px', color: '#64748b' },
            children: [execution.duration_ms, 'ms'],
          }),
        ],
      }),
      _jsxs('div', {
        style: {
          fontSize: '10px',
          color: '#94a3b8',
          marginTop: '2px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },
        children: [
          execution.code.slice(0, 60),
          execution.code.length > 60 && '...',
        ],
      }),
    ],
  });
}
