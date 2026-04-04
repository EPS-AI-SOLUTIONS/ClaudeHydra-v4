/**
 * SwarmView — Cross-Agent Communication Visualization
 *
 * Uses @xyflow/react to render an interactive agent network graph showing
 * peer Hydra instances, their status, and delegation flows between them.
 */
import { Background, Controls, MarkerType, MiniMap, Panel, Position, ReactFlow } from '@xyflow/react';
import { useCallback, useMemo, useState } from 'react';
import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import '@xyflow/react/dist/style.css';
import {
  Activity,
  Brain,
  CheckCircle2,
  Globe,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  Network,
  Paperclip,
  Play,
  RefreshCw,
  Send,
  Shield,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useSwarm } from '../hooks/useSwarm';
import { MemoryPruningPanel } from './MemoryPruningPanel';
import { SandboxPanel } from './SandboxPanel';
import { SwarmBuilder } from './SwarmBuilder';

// ── Provider colors ──────────────────────────────────────────────────────────
const PROVIDER_COLORS = {
  anthropic: { bg: '#1a1a2e', border: '#d97706', text: '#fbbf24' },
  google: { bg: '#1a2e1a', border: '#22c55e', text: '#4ade80' },
  xai: { bg: '#2e1a1a', border: '#ef4444', text: '#f87171' },
  openai: { bg: '#1a2e2e', border: '#06b6d4', text: '#22d3ee' },
  deepseek: { bg: '#2e1a2e', border: '#a855f7', text: '#c084fc' },
  multi: { bg: '#2e2e1a', border: '#eab308', text: '#facc15' },
};
const STATUS_COLORS = {
  online: '#22c55e',
  offline: '#6b7280',
  degraded: '#f59e0b',
  unknown: '#6b7280',
};
// ── Peer Node Component ──────────────────────────────────────────────────────
const DEFAULT_COLORS = { bg: '#2e2e1a', border: '#eab308', text: '#facc15' };
function PeerNode({ data }) {
  const { peer, isSelf } = data;
  const colors = PROVIDER_COLORS[peer.provider] ?? DEFAULT_COLORS;
  return _jsxs('div', {
    style: {
      background: colors.bg,
      border: `2px solid ${isSelf ? '#ffffff' : colors.border}`,
      borderRadius: '12px',
      padding: '16px 20px',
      minWidth: '160px',
      boxShadow: isSelf ? '0 0 20px rgba(255,255,255,0.15)' : `0 0 12px ${colors.border}33`,
      position: 'relative',
    },
    children: [
      _jsx('div', {
        style: {
          position: 'absolute',
          top: '8px',
          right: '8px',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: STATUS_COLORS[peer.status] || '#6b7280',
          boxShadow: peer.status === 'online' ? `0 0 8px ${STATUS_COLORS['online']}` : 'none',
        },
      }),
      _jsx('div', { style: { fontSize: '14px', fontWeight: 700, color: colors.text }, children: peer.name }),
      _jsxs('div', {
        style: { fontSize: '11px', color: '#94a3b8', marginTop: '4px' },
        children: [peer.provider.toUpperCase(), ' \u00B7 :', peer.port],
      }),
      peer.version &&
        _jsxs('div', {
          style: { fontSize: '10px', color: '#64748b', marginTop: '2px' },
          children: ['v', peer.version],
        }),
      isSelf &&
        _jsx('div', {
          style: {
            fontSize: '9px',
            color: '#fbbf24',
            marginTop: '4px',
            textTransform: 'uppercase',
            letterSpacing: '1px',
          },
          children: 'This Instance',
        }),
    ],
  });
}
const nodeTypes = { peer: PeerNode };
// ── Main Component ───────────────────────────────────────────────────────────
export function SwarmView() {
  const { t } = useTranslation();
  const { peers, tasks, events, stats, isDiscovering, isDelegating, discover, delegate, loadTask, selectedTask } =
    useSwarm();
  const [showDelegatePanel, setShowDelegatePanel] = useState(false);
  const [delegatePrompt, setDelegatePrompt] = useState('');
  const [delegatePattern, setDelegatePattern] = useState('parallel');
  const [delegateTargets, setDelegateTargets] = useState([]);
  const [delegateAttachments, setDelegateAttachments] = useState([]);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [activeTab, setActiveTab] = useState('monitoring');
  // ── Build flow graph ───────────────────────────────────────────────────
  const { nodes, edges } = useMemo(() => {
    const centerX = 400;
    const centerY = 300;
    const radius = 220;
    const flowNodes = peers.map((peer, i) => {
      const angle = (2 * Math.PI * i) / peers.length - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle) - 80;
      const y = centerY + radius * Math.sin(angle) - 40;
      return {
        id: peer.id,
        type: 'peer',
        position: { x, y },
        data: { peer, isSelf: peer.id === 'claudehydra' },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
    });
    // Create edges for recent delegations
    const flowEdges = [];
    const recentTasks = tasks.slice(0, 10);
    for (const task of recentTasks) {
      for (const target of task.target_peers) {
        const isSuccess = task.status === 'completed';
        const isRunning = task.status === 'running';
        flowEdges.push({
          id: `${task.id}-${target}`,
          source: task.source_peer,
          target,
          animated: isRunning,
          style: {
            stroke: isSuccess ? '#22c55e' : isRunning ? '#3b82f6' : '#ef4444',
            strokeWidth: 2,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isSuccess ? '#22c55e' : isRunning ? '#3b82f6' : '#ef4444',
          },
          label: isRunning ? 'working...' : task.pattern,
          labelStyle: { fontSize: 10, fill: '#94a3b8' },
        });
      }
    }
    return { nodes: flowNodes, edges: flowEdges };
  }, [peers, tasks]);
  // ── Delegate handler ───────────────────────────────────────────────────
  const handleDelegate = useCallback(async () => {
    if (!delegatePrompt.trim()) return;
    await delegate(delegatePrompt, delegatePattern, delegateTargets, 120, delegateAttachments);
    setDelegatePrompt('');
    setDelegateAttachments([]);
    setAttachmentUrl('');
    setShowDelegatePanel(false);
  }, [delegate, delegatePrompt, delegatePattern, delegateTargets, delegateAttachments]);
  const addAttachment = useCallback(() => {
    if (!attachmentUrl.trim()) return;
    const url = attachmentUrl.trim();
    // Infer content type from URL
    let contentType = 'application/octet-stream';
    const ext = url.split('.').pop()?.toLowerCase() ?? '';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext))
      contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    else if (ext === 'pdf') contentType = 'application/pdf';
    else if (['txt', 'md', 'log'].includes(ext)) contentType = 'text/plain';
    else if (['json'].includes(ext)) contentType = 'application/json';
    const name = url.split('/').pop() || 'attachment';
    setDelegateAttachments((prev) => [...prev, { contentType, url, name }]);
    setAttachmentUrl('');
  }, [attachmentUrl]);
  const removeAttachment = useCallback((index) => {
    setDelegateAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);
  // ── Toggle target selection ────────────────────────────────────────────
  const toggleTarget = useCallback((peerId) => {
    setDelegateTargets((prev) => (prev.includes(peerId) ? prev.filter((id) => id !== peerId) : [...prev, peerId]));
  }, []);
  return _jsxs('div', {
    style: { display: 'flex', flexDirection: 'column', height: '100%', background: '#0a0a0f' },
    children: [
      _jsxs('div', {
        style: { display: 'flex', gap: '8px', padding: '12px', borderBottom: '1px solid #1e293b' },
        children: [
          _jsxs('button', {
            type: 'button',
            onClick: () => setActiveTab('monitoring'),
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              background: activeTab === 'monitoring' ? '#1e293b' : 'transparent',
              color: activeTab === 'monitoring' ? '#e2e8f0' : '#94a3b8',
              border: activeTab === 'monitoring' ? '1px solid #334155' : '1px solid transparent',
              cursor: 'pointer',
              fontSize: '13px',
            },
            children: [_jsx(Activity, { size: 16 }), ' ', t('swarm.tabs.monitoring')],
          }),
          _jsxs('button', {
            type: 'button',
            onClick: () => setActiveTab('builder'),
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              background: activeTab === 'builder' ? '#1e293b' : 'transparent',
              color: activeTab === 'builder' ? '#e2e8f0' : '#94a3b8',
              border: activeTab === 'builder' ? '1px solid #334155' : '1px solid transparent',
              cursor: 'pointer',
              fontSize: '13px',
            },
            children: [_jsx(LayoutTemplate, { size: 16 }), ' ', t('swarm.tabs.builder')],
          }),
          _jsxs('button', {
            type: 'button',
            onClick: () => setActiveTab('sandbox'),
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              background: activeTab === 'sandbox' ? '#1e293b' : 'transparent',
              color: activeTab === 'sandbox' ? '#10b981' : '#94a3b8',
              border: activeTab === 'sandbox' ? '1px solid #10b981' : '1px solid transparent',
              cursor: 'pointer',
              fontSize: '13px',
            },
            children: [_jsx(Shield, { size: 16 }), ' ', t('swarm.tabs.sandbox')],
          }),
          _jsxs('button', {
            type: 'button',
            onClick: () => setActiveTab('pruning'),
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              background: activeTab === 'pruning' ? '#1e293b' : 'transparent',
              color: activeTab === 'pruning' ? '#c084fc' : '#94a3b8',
              border: activeTab === 'pruning' ? '1px solid #a855f7' : '1px solid transparent',
              cursor: 'pointer',
              fontSize: '13px',
            },
            children: [_jsx(Brain, { size: 16 }), ' ', t('swarm.tabs.pruning')],
          }),
        ],
      }),
      activeTab === 'pruning'
        ? _jsx('div', { style: { flex: 1, minHeight: 0 }, children: _jsx(MemoryPruningPanel, {}) })
        : activeTab === 'sandbox'
          ? _jsx('div', { style: { flex: 1, minHeight: 0 }, children: _jsx(SandboxPanel, {}) })
          : activeTab === 'builder'
            ? _jsx('div', { style: { flex: 1, minHeight: 0 }, children: _jsx(SwarmBuilder, { events: events }) })
            : _jsxs('div', {
                style: { display: 'flex', flex: 1, minHeight: 0 },
                children: [
                  _jsxs('div', {
                    style: { flex: 1, position: 'relative' },
                    children: [
                      _jsxs(ReactFlow, {
                        nodes: nodes,
                        edges: edges,
                        nodeTypes: nodeTypes,
                        fitView: true,
                        proOptions: { hideAttribution: true },
                        style: { background: '#0a0a0f' },
                        children: [
                          _jsx(Background, { color: '#1e293b', gap: 24 }),
                          _jsx(Controls, { style: { background: '#1e293b', borderColor: '#334155' } }),
                          _jsx(MiniMap, {
                            nodeColor: (node) => {
                              const peer = node.data?.['peer'];
                              if (!peer) return '#6b7280';
                              return STATUS_COLORS[peer.status] || '#6b7280';
                            },
                            style: { background: '#0f172a', borderColor: '#334155' },
                          }),
                          _jsx(Panel, {
                            position: 'top-left',
                            children: _jsxs('div', {
                              style: {
                                display: 'flex',
                                gap: '12px',
                                alignItems: 'center',
                                padding: '8px 12px',
                                background: '#0f172a',
                                borderRadius: '8px',
                                border: '1px solid #1e293b',
                              },
                              children: [
                                _jsxs('div', {
                                  style: { display: 'flex', alignItems: 'center', gap: '6px' },
                                  children: [
                                    _jsx(Network, { size: 16, color: '#3b82f6' }),
                                    _jsx('span', {
                                      style: { fontSize: '13px', color: '#e2e8f0', fontWeight: 600 },
                                      children: t('swarm.title'),
                                    }),
                                  ],
                                }),
                                _jsx('div', { style: { width: '1px', height: '20px', background: '#334155' } }),
                                _jsx(Stat, {
                                  icon: _jsx(Globe, { size: 14 }),
                                  label: t('swarm.stats.online'),
                                  value: `${stats.onlinePeers}/${stats.totalPeers}`,
                                  color: '#22c55e',
                                }),
                                _jsx(Stat, {
                                  icon: _jsx(Activity, { size: 14 }),
                                  label: t('swarm.stats.running'),
                                  value: stats.runningTasks,
                                  color: '#3b82f6',
                                }),
                                _jsx(Stat, {
                                  icon: _jsx(CheckCircle2, { size: 14 }),
                                  label: t('swarm.stats.done'),
                                  value: stats.completedTasks,
                                  color: '#22c55e',
                                }),
                                _jsx(Stat, {
                                  icon: _jsx(XCircle, { size: 14 }),
                                  label: t('swarm.stats.failed'),
                                  value: stats.failedTasks,
                                  color: '#ef4444',
                                }),
                                _jsx('div', { style: { width: '1px', height: '20px', background: '#334155' } }),
                                _jsxs('button', {
                                  type: 'button',
                                  onClick: discover,
                                  disabled: isDiscovering,
                                  style: {
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '4px 10px',
                                    background: '#1e293b',
                                    border: '1px solid #334155',
                                    borderRadius: '6px',
                                    color: '#e2e8f0',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                  },
                                  children: [
                                    isDiscovering
                                      ? _jsx(Loader2, { size: 14, className: 'animate-spin' })
                                      : _jsx(RefreshCw, { size: 14 }),
                                    t('swarm.discover'),
                                  ],
                                }),
                                _jsxs('button', {
                                  type: 'button',
                                  onClick: () => setShowDelegatePanel(!showDelegatePanel),
                                  style: {
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '4px 10px',
                                    background: '#3b82f6',
                                    border: 'none',
                                    borderRadius: '6px',
                                    color: '#fff',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                  },
                                  children: [_jsx(Send, { size: 14 }), t('swarm.delegate')],
                                }),
                              ],
                            }),
                          }),
                        ],
                      }),
                      _jsx(AnimatePresence, {
                        children:
                          showDelegatePanel &&
                          _jsxs(motion.div, {
                            initial: { opacity: 0, y: -10 },
                            animate: { opacity: 1, y: 0 },
                            exit: { opacity: 0, y: -10 },
                            style: {
                              position: 'absolute',
                              top: '60px',
                              left: '12px',
                              width: '400px',
                              background: '#0f172a',
                              border: '1px solid #1e293b',
                              borderRadius: '12px',
                              padding: '16px',
                              zIndex: 10,
                            },
                            children: [
                              _jsxs('div', {
                                style: { fontSize: '14px', fontWeight: 600, color: '#e2e8f0', marginBottom: '12px' },
                                children: [
                                  _jsx(Zap, { size: 16, style: { display: 'inline', marginRight: '6px' } }),
                                  t('swarm.delegateTitle'),
                                ],
                              }),
                              _jsx('textarea', {
                                value: delegatePrompt,
                                onChange: (e) => setDelegatePrompt(e.target.value),
                                placeholder: t('swarm.delegatePrompt'),
                                rows: 3,
                                style: {
                                  width: '100%',
                                  background: '#1e293b',
                                  border: '1px solid #334155',
                                  borderRadius: '8px',
                                  color: '#e2e8f0',
                                  padding: '8px 12px',
                                  fontSize: '13px',
                                  resize: 'vertical',
                                  fontFamily: 'inherit',
                                },
                              }),
                              _jsx('div', {
                                style: { display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' },
                                children: ['parallel', 'sequential', 'review', 'fan_out'].map((p) =>
                                  _jsx(
                                    'button',
                                    {
                                      type: 'button',
                                      onClick: () => setDelegatePattern(p),
                                      style: {
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        fontSize: '11px',
                                        border: delegatePattern === p ? '1px solid #3b82f6' : '1px solid #334155',
                                        background: delegatePattern === p ? '#1e3a5f' : '#1e293b',
                                        color: delegatePattern === p ? '#60a5fa' : '#94a3b8',
                                        cursor: 'pointer',
                                      },
                                      children: p,
                                    },
                                    p,
                                  ),
                                ),
                              }),
                              _jsxs('div', {
                                style: { marginTop: '10px' },
                                children: [
                                  _jsx('div', {
                                    style: { fontSize: '11px', color: '#94a3b8', marginBottom: '6px' },
                                    children: t('swarm.delegateTargets'),
                                  }),
                                  _jsx('div', {
                                    style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
                                    children: peers
                                      .filter((p) => p.id !== 'claudehydra' && p.status === 'online')
                                      .map((peer) => {
                                        const selected = delegateTargets.includes(peer.id);
                                        const colors = PROVIDER_COLORS[peer.provider] ?? DEFAULT_COLORS;
                                        return _jsx(
                                          'button',
                                          {
                                            type: 'button',
                                            onClick: () => toggleTarget(peer.id),
                                            style: {
                                              padding: '3px 8px',
                                              borderRadius: '6px',
                                              fontSize: '11px',
                                              border: `1px solid ${selected ? colors.border : '#334155'}`,
                                              background: selected ? `${colors.bg}` : '#1e293b',
                                              color: selected ? colors.text : '#94a3b8',
                                              cursor: 'pointer',
                                            },
                                            children: peer.name,
                                          },
                                          peer.id,
                                        );
                                      }),
                                  }),
                                ],
                              }),
                              _jsxs('div', {
                                style: { marginTop: '10px' },
                                children: [
                                  _jsxs('div', {
                                    style: {
                                      fontSize: '11px',
                                      color: '#94a3b8',
                                      marginBottom: '6px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    },
                                    children: [_jsx(Paperclip, { size: 12 }), t('swarm.delegateAttachments')],
                                  }),
                                  _jsxs('div', {
                                    style: { display: 'flex', gap: '6px' },
                                    children: [
                                      _jsx('input', {
                                        type: 'text',
                                        value: attachmentUrl,
                                        onChange: (e) => setAttachmentUrl(e.target.value),
                                        onKeyDown: (e) => e.key === 'Enter' && addAttachment(),
                                        placeholder: 'https://... or file:///...',
                                        style: {
                                          flex: 1,
                                          background: '#1e293b',
                                          border: '1px solid #334155',
                                          borderRadius: '6px',
                                          color: '#e2e8f0',
                                          padding: '4px 8px',
                                          fontSize: '11px',
                                        },
                                      }),
                                      _jsx('button', {
                                        type: 'button',
                                        onClick: addAttachment,
                                        disabled: !attachmentUrl.trim(),
                                        style: {
                                          padding: '4px 8px',
                                          background: '#1e293b',
                                          border: '1px solid #334155',
                                          borderRadius: '6px',
                                          color: '#e2e8f0',
                                          fontSize: '11px',
                                          cursor: attachmentUrl.trim() ? 'pointer' : 'not-allowed',
                                        },
                                        children: t('swarm.addAttachment'),
                                      }),
                                    ],
                                  }),
                                  delegateAttachments.length > 0 &&
                                    _jsx('div', {
                                      style: { display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' },
                                      children: delegateAttachments.map((att, attIdx) =>
                                        _jsxs(
                                          'div',
                                          {
                                            style: {
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '4px',
                                              padding: '3px 8px',
                                              background: '#1e293b',
                                              border: '1px solid #334155',
                                              borderRadius: '6px',
                                              fontSize: '10px',
                                              color: '#94a3b8',
                                            },
                                            children: [
                                              att.contentType.startsWith('image/')
                                                ? _jsx(ImageIcon, { size: 10, color: '#3b82f6' })
                                                : _jsx(Paperclip, { size: 10, color: '#94a3b8' }),
                                              _jsx('span', {
                                                style: {
                                                  maxWidth: '120px',
                                                  overflow: 'hidden',
                                                  textOverflow: 'ellipsis',
                                                  whiteSpace: 'nowrap',
                                                },
                                                children: att.name || 'attachment',
                                              }),
                                              _jsx('button', {
                                                type: 'button',
                                                onClick: () => removeAttachment(attIdx),
                                                style: {
                                                  background: 'none',
                                                  border: 'none',
                                                  color: '#ef4444',
                                                  cursor: 'pointer',
                                                  padding: '0',
                                                  display: 'flex',
                                                },
                                                children: _jsx(Trash2, { size: 10 }),
                                              }),
                                            ],
                                          },
                                          att.url,
                                        ),
                                      ),
                                    }),
                                ],
                              }),
                              _jsx('button', {
                                type: 'button',
                                onClick: handleDelegate,
                                disabled: isDelegating || !delegatePrompt.trim(),
                                style: {
                                  width: '100%',
                                  marginTop: '12px',
                                  padding: '8px',
                                  background: isDelegating ? '#1e293b' : '#3b82f6',
                                  border: 'none',
                                  borderRadius: '8px',
                                  color: '#fff',
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  cursor: isDelegating ? 'not-allowed' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px',
                                },
                                children: isDelegating
                                  ? _jsxs(_Fragment, {
                                      children: [
                                        _jsx(Loader2, { size: 14, className: 'animate-spin' }),
                                        t('swarm.delegating'),
                                      ],
                                    })
                                  : _jsxs(_Fragment, { children: [_jsx(Play, { size: 14 }), t('swarm.executing')] }),
                              }),
                            ],
                          }),
                      }),
                    ],
                  }),
                  _jsxs('div', {
                    style: {
                      width: '320px',
                      borderLeft: '1px solid #1e293b',
                      background: '#0f172a',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                    },
                    children: [
                      _jsxs('div', {
                        style: { flex: 1, overflow: 'auto', padding: '12px' },
                        children: [
                          _jsx('div', {
                            style: { fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginBottom: '8px' },
                            children: t('swarm.recentTasks'),
                          }),
                          tasks.length === 0
                            ? _jsx('div', {
                                style: { fontSize: '12px', color: '#64748b', padding: '20px 0', textAlign: 'center' },
                                children: t('swarm.noTasks'),
                              })
                            : tasks
                                .slice(0, 20)
                                .map((task) =>
                                  _jsx(TaskRow, { task: task, onClick: () => loadTask(task.id) }, task.id),
                                ),
                        ],
                      }),
                      _jsxs('div', {
                        style: {
                          height: '200px',
                          borderTop: '1px solid #1e293b',
                          overflow: 'auto',
                          padding: '12px',
                        },
                        children: [
                          _jsx('div', {
                            style: { fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginBottom: '8px' },
                            children: t('swarm.liveEvents'),
                          }),
                          events.length === 0
                            ? _jsx('div', {
                                style: { fontSize: '12px', color: '#64748b', textAlign: 'center', padding: '12px' },
                                children: t('swarm.waitingEvents'),
                              })
                            : events.slice(0, 30).map((event) =>
                                _jsxs(
                                  'div',
                                  {
                                    style: {
                                      fontSize: '11px',
                                      color: '#94a3b8',
                                      padding: '3px 0',
                                      borderBottom: '1px solid #1e293b22',
                                    },
                                    children: [
                                      _jsx('span', {
                                        style: { color: eventColor(event.eventType) },
                                        children: event.eventType,
                                      }),
                                      event.peerId &&
                                        _jsxs('span', {
                                          style: { color: '#64748b' },
                                          children: [' [', event.peerId, ']'],
                                        }),
                                      _jsxs('span', { children: [' \u2014 ', event.message] }),
                                    ],
                                  },
                                  `${event.taskId}-${event.timestamp}-${event.eventType}-${event.peerId ?? ''}`,
                                ),
                              ),
                        ],
                      }),
                      _jsx(AnimatePresence, {
                        children:
                          selectedTask &&
                          _jsxs(motion.div, {
                            initial: { x: 320 },
                            animate: { x: 0 },
                            exit: { x: 320 },
                            style: {
                              position: 'absolute',
                              right: 0,
                              top: 0,
                              bottom: 0,
                              width: '400px',
                              background: '#0f172a',
                              borderLeft: '1px solid #1e293b',
                              zIndex: 20,
                              overflow: 'auto',
                              padding: '16px',
                            },
                            children: [
                              _jsxs('div', {
                                style: { display: 'flex', justifyContent: 'space-between', marginBottom: '12px' },
                                children: [
                                  _jsx('div', {
                                    style: { fontSize: '14px', fontWeight: 600, color: '#e2e8f0' },
                                    children: t('swarm.taskDetails'),
                                  }),
                                  _jsx('button', {
                                    type: 'button',
                                    onClick: () => loadTask(''),
                                    style: {
                                      background: 'none',
                                      border: 'none',
                                      color: '#94a3b8',
                                      cursor: 'pointer',
                                      fontSize: '16px',
                                    },
                                    children: '\u00D7',
                                  }),
                                ],
                              }),
                              _jsxs('div', {
                                style: { fontSize: '12px', color: '#94a3b8' },
                                children: [
                                  _jsxs('div', {
                                    children: [
                                      'Pattern: ',
                                      _jsx('span', { style: { color: '#e2e8f0' }, children: selectedTask.pattern }),
                                    ],
                                  }),
                                  _jsxs('div', {
                                    children: [
                                      'Status: ',
                                      _jsx('span', {
                                        style: { color: statusColor(selectedTask.status) },
                                        children: selectedTask.status,
                                      }),
                                    ],
                                  }),
                                  selectedTask.duration_ms &&
                                    _jsxs('div', {
                                      children: [
                                        'Duration: ',
                                        _jsxs('span', {
                                          style: { color: '#e2e8f0' },
                                          children: [selectedTask.duration_ms, 'ms'],
                                        }),
                                      ],
                                    }),
                                ],
                              }),
                              _jsxs('div', {
                                style: { fontSize: '12px', color: '#94a3b8', marginTop: '12px' },
                                children: [
                                  _jsx('div', {
                                    style: { fontWeight: 600, color: '#e2e8f0', marginBottom: '6px' },
                                    children: 'Prompt:',
                                  }),
                                  _jsx('div', {
                                    style: {
                                      background: '#1e293b',
                                      padding: '8px',
                                      borderRadius: '6px',
                                      whiteSpace: 'pre-wrap',
                                    },
                                    children: selectedTask.prompt,
                                  }),
                                  selectedTask.attachments &&
                                    selectedTask.attachments.length > 0 &&
                                    _jsx('div', {
                                      style: { display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' },
                                      children: selectedTask.attachments.map((att) =>
                                        _jsx(
                                          'div',
                                          {
                                            style: {
                                              position: 'relative',
                                              width: '60px',
                                              height: '60px',
                                              borderRadius: '4px',
                                              overflow: 'hidden',
                                              border: '1px solid #334155',
                                            },
                                            children: att.contentType.startsWith('image/')
                                              ? _jsx('img', {
                                                  src: att.url,
                                                  alt: att.name || 'attachment',
                                                  style: { width: '100%', height: '100%', objectFit: 'cover' },
                                                })
                                              : _jsx('div', {
                                                  style: {
                                                    width: '100%',
                                                    height: '100%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    background: '#0f172a',
                                                    fontSize: '10px',
                                                  },
                                                  children: 'DOC',
                                                }),
                                          },
                                          att.url,
                                        ),
                                      ),
                                    }),
                                ],
                              }),
                              selectedTask.results.map((result) =>
                                _jsxs(
                                  'div',
                                  {
                                    style: {
                                      marginTop: '12px',
                                      padding: '10px',
                                      background: '#1e293b',
                                      borderRadius: '8px',
                                      borderLeft: `3px solid ${result.status === 'success' ? '#22c55e' : '#ef4444'}`,
                                    },
                                    children: [
                                      _jsxs('div', {
                                        style: { fontSize: '12px', fontWeight: 600, color: '#e2e8f0' },
                                        children: [
                                          result.peer_name,
                                          result.model_used &&
                                            _jsxs('span', {
                                              style: { fontWeight: 400, color: '#64748b' },
                                              children: [' \u00B7 ', result.model_used],
                                            }),
                                        ],
                                      }),
                                      _jsxs('div', {
                                        style: { fontSize: '11px', color: '#94a3b8', marginTop: '2px' },
                                        children: [
                                          result.duration_ms,
                                          'ms',
                                          result.tokens_used && ` · ${result.tokens_used} tokens`,
                                        ],
                                      }),
                                      result.content &&
                                        _jsx('div', {
                                          style: {
                                            fontSize: '11px',
                                            color: '#cbd5e1',
                                            marginTop: '6px',
                                            maxHeight: '200px',
                                            overflow: 'auto',
                                            whiteSpace: 'pre-wrap',
                                          },
                                          children: result.content,
                                        }),
                                      result.attachments &&
                                        result.attachments.length > 0 &&
                                        _jsx('div', {
                                          style: { display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' },
                                          children: result.attachments.map((att) =>
                                            _jsx(
                                              'div',
                                              {
                                                style: {
                                                  position: 'relative',
                                                  width: '60px',
                                                  height: '60px',
                                                  borderRadius: '4px',
                                                  overflow: 'hidden',
                                                  border: '1px solid #3b82f6',
                                                },
                                                children: att.contentType.startsWith('image/')
                                                  ? _jsx('img', {
                                                      src: att.url,
                                                      alt: att.name || 'result attachment',
                                                      style: { width: '100%', height: '100%', objectFit: 'cover' },
                                                    })
                                                  : _jsx('div', {
                                                      style: {
                                                        width: '100%',
                                                        height: '100%',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        background: '#0a0a0f',
                                                        fontSize: '10px',
                                                      },
                                                      children: 'DOC',
                                                    }),
                                              },
                                              att.url,
                                            ),
                                          ),
                                        }),
                                      result.error &&
                                        _jsx('div', {
                                          style: { fontSize: '11px', color: '#f87171', marginTop: '4px' },
                                          children: result.error,
                                        }),
                                    ],
                                  },
                                  result.peer_id,
                                ),
                              ),
                            ],
                          }),
                      }),
                    ],
                  }),
                ],
              }),
    ],
  });
}
// ── Helper Components ────────────────────────────────────────────────────────
function Stat({ icon, label, value, color }) {
  return _jsxs('div', {
    style: { display: 'flex', alignItems: 'center', gap: '4px' },
    children: [
      _jsx('span', { style: { color }, children: icon }),
      _jsxs('span', { style: { fontSize: '11px', color: '#64748b' }, children: [label, ':'] }),
      _jsx('span', { style: { fontSize: '12px', color, fontWeight: 600 }, children: value }),
    ],
  });
}
function TaskRow({ task, onClick }) {
  return _jsxs('button', {
    type: 'button',
    onClick: onClick,
    style: {
      display: 'block',
      width: '100%',
      textAlign: 'left',
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: '8px',
      padding: '8px 10px',
      marginBottom: '6px',
      cursor: 'pointer',
      color: '#e2e8f0',
    },
    children: [
      _jsxs('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
        children: [
          _jsx('span', { style: { fontSize: '11px', fontWeight: 600 }, children: task.pattern }),
          _jsx('span', {
            style: {
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: '4px',
              background: statusBg(task.status),
              color: statusColor(task.status),
            },
            children: task.status,
          }),
        ],
      }),
      _jsxs('div', {
        style: { fontSize: '11px', color: '#94a3b8', marginTop: '3px' },
        children: [task.prompt_preview.slice(0, 80), task.prompt_preview.length > 80 && '...'],
      }),
      _jsxs('div', {
        style: { fontSize: '10px', color: '#64748b', marginTop: '3px' },
        children: [
          task.success_count,
          '/',
          task.results_count,
          ' peers',
          task.duration_ms && ` · ${task.duration_ms}ms`,
        ],
      }),
    ],
  });
}
function statusColor(status) {
  switch (status) {
    case 'completed':
      return '#22c55e';
    case 'running':
      return '#3b82f6';
    case 'failed':
      return '#ef4444';
    case 'partial_success':
      return '#f59e0b';
    default:
      return '#94a3b8';
  }
}
function statusBg(status) {
  switch (status) {
    case 'completed':
      return '#052e16';
    case 'running':
      return '#172554';
    case 'failed':
      return '#450a0a';
    case 'partial_success':
      return '#451a03';
    default:
      return '#1e293b';
  }
}
function eventColor(eventType) {
  if (eventType.includes('completed') || eventType.includes('discovered')) return '#22c55e';
  if (eventType.includes('error') || eventType.includes('failed') || eventType.includes('lost')) return '#ef4444';
  if (eventType.includes('sent') || eventType.includes('working')) return '#3b82f6';
  if (eventType.includes('timeout')) return '#f59e0b';
  if (eventType.includes('attachment') || eventType.includes('media')) return '#a855f7';
  return '#94a3b8';
}
