import {
  addEdge,
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import React, { useCallback, useRef, useState } from 'react';
import {
  Fragment as _Fragment,
  jsx as _jsx,
  jsxs as _jsxs,
} from 'react/jsx-runtime';
import '@xyflow/react/dist/style.css';
import { toast } from 'sonner';
import Bot from '~icons/lucide/bot';
import Database from '~icons/lucide/database';
import Download from '~icons/lucide/download';
import ImageIcon from '~icons/lucide/image';
import Play from '~icons/lucide/play';
import Save from '~icons/lucide/save';
import Shield from '~icons/lucide/shield';
import Wrench from '~icons/lucide/wrench';

// ── Custom Nodes ─────────────────────────────────────────────────────────────
const nodeStyle = {
  padding: '12px 16px',
  borderRadius: '12px',
  border: '2px solid #334155',
  background: '#1e293b',
  color: '#e2e8f0',
  minWidth: '150px',
  fontSize: '12px',
  boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
};
function AgentNode({ data }) {
  return _jsxs('div', {
    style: { ...nodeStyle, border: '2px solid #3b82f6' },
    children: [
      _jsx(Handle, { type: 'target', position: Position.Top }),
      _jsxs('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: 'bold',
          marginBottom: '8px',
        },
        children: [
          _jsx(Bot, { width: 16, height: 16, color: '#60a5fa' }),
          data.label,
        ],
      }),
      _jsxs('div', {
        style: { color: '#94a3b8', fontSize: '10px' },
        children: ['Model: ', data.model || 'Unknown'],
      }),
      _jsx(Handle, { type: 'source', position: Position.Bottom }),
    ],
  });
}
function McpNode({ data }) {
  return _jsxs('div', {
    style: { ...nodeStyle, border: '2px solid #eab308' },
    children: [
      _jsx(Handle, { type: 'target', position: Position.Top }),
      _jsxs('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: 'bold',
          marginBottom: '8px',
        },
        children: [
          _jsx(Wrench, { width: 16, height: 16, color: '#facc15' }),
          data.label,
        ],
      }),
      _jsxs('div', {
        style: { color: '#94a3b8', fontSize: '10px' },
        children: ['Server: ', data.server || 'Local'],
      }),
      _jsx(Handle, { type: 'source', position: Position.Bottom }),
    ],
  });
}
function DbNode({ data }) {
  return _jsxs('div', {
    style: { ...nodeStyle, border: '2px solid #22c55e' },
    children: [
      _jsx(Handle, { type: 'target', position: Position.Top }),
      _jsxs('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: 'bold',
          marginBottom: '8px',
        },
        children: [
          _jsx(Database, { width: 16, height: 16, color: '#4ade80' }),
          data.label,
        ],
      }),
      _jsxs('div', {
        style: { color: '#94a3b8', fontSize: '10px' },
        children: ['Type: ', data.dbType || 'SQL'],
      }),
      _jsx(Handle, { type: 'source', position: Position.Bottom }),
    ],
  });
}
function SandboxNode({ data }) {
  return _jsxs('div', {
    style: {
      ...nodeStyle,
      border: '2px solid #10b981',
      background: '#0f2e1f',
    },
    children: [
      _jsx(Handle, { type: 'target', position: Position.Top }),
      _jsxs('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: 'bold',
          marginBottom: '8px',
        },
        children: [
          _jsx(Shield, { width: 16, height: 16, color: '#10b981' }),
          data.label,
        ],
      }),
      _jsxs('div', {
        style: { color: '#94a3b8', fontSize: '10px' },
        children: [
          data.language || 'node',
          ' \u00B7 ',
          data.isolated ? 'Docker' : 'Process',
        ],
      }),
      _jsx('div', {
        style: {
          color: '#10b981',
          fontSize: '9px',
          marginTop: '4px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        },
        children: 'Isolated Sandbox',
      }),
      _jsx(Handle, { type: 'source', position: Position.Bottom }),
    ],
  });
}
const nodeTypes = {
  agent: AgentNode,
  mcp: McpNode,
  database: DbNode,
  sandbox: SandboxNode,
};
function MediaEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  return _jsxs(_Fragment, {
    children: [
      _jsx(BaseEdge, {
        path: edgePath,
        markerEnd: markerEnd,
        style: style,
        id: id,
      }),
      _jsx(EdgeLabelRenderer, {
        children: _jsx('div', {
          style: {
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            background: '#1e293b',
            padding: '4px',
            borderRadius: '50%',
            border: '1px solid #3b82f6',
            pointerEvents: 'all',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          },
          className: 'nodrag nopan',
          children: _jsx(ImageIcon, {
            width: 12,
            height: 12,
            color: '#60a5fa',
          }),
        }),
      }),
    ],
  });
}
const edgeTypes = {
  media: MediaEdge,
};
// ── Sidebar for Draggable Nodes ──────────────────────────────────────────────
const itemStyle = {
  padding: '10px',
  marginBottom: '10px',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '6px',
  cursor: 'grab',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '12px',
  color: '#e2e8f0',
};
function DraggableItem({ nodeType, label, extraData = {}, children }) {
  const handleDragStart = (event) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label);
    event.dataTransfer.setData(
      'application/reactflow-data',
      JSON.stringify(extraData),
    );
    event.dataTransfer.effectAllowed = 'move';
  };
  return _jsx('div', {
    role: 'option',
    tabIndex: 0,
    style: itemStyle,
    onDragStart: handleDragStart,
    draggable: true,
    children: children,
  });
}
function Sidebar() {
  return _jsxs('div', {
    style: {
      width: '250px',
      background: '#0f172a',
      borderRight: '1px solid #1e293b',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
    },
    role: 'listbox',
    'aria-label': 'Toolbox',
    children: [
      _jsx('div', {
        style: {
          fontSize: '14px',
          fontWeight: 'bold',
          color: '#e2e8f0',
          marginBottom: '16px',
        },
        children: 'Toolbox',
      }),
      _jsx('div', {
        style: {
          fontSize: '11px',
          color: '#94a3b8',
          marginBottom: '8px',
          textTransform: 'uppercase',
        },
        children: 'Agents',
      }),
      _jsxs(DraggableItem, {
        nodeType: 'agent',
        label: 'Claude Agent',
        extraData: { model: 'claude-3-5-sonnet', peerId: 'claudehydra' },
        children: [
          _jsx(Bot, { width: 14, height: 14, color: '#60a5fa' }),
          ' Claude',
        ],
      }),
      _jsxs(DraggableItem, {
        nodeType: 'agent',
        label: 'DeepSeek Agent',
        extraData: { model: 'deepseek-coder', peerId: 'deepseekhydra' },
        children: [
          _jsx(Bot, { width: 14, height: 14, color: '#60a5fa' }),
          ' DeepSeek',
        ],
      }),
      _jsxs(DraggableItem, {
        nodeType: 'agent',
        label: 'Gemini Agent',
        extraData: { model: 'gemini-1.5-pro', peerId: 'geminihydra' },
        children: [
          _jsx(Bot, { width: 14, height: 14, color: '#60a5fa' }),
          ' Gemini',
        ],
      }),
      _jsxs(DraggableItem, {
        nodeType: 'agent',
        label: 'Grok Agent',
        extraData: { model: 'grok-beta', peerId: 'grokhydra' },
        children: [
          _jsx(Bot, { width: 14, height: 14, color: '#60a5fa' }),
          ' Grok',
        ],
      }),
      _jsxs(DraggableItem, {
        nodeType: 'agent',
        label: 'OpenAI Agent',
        extraData: { model: 'gpt-4o', peerId: 'openaihydra' },
        children: [
          _jsx(Bot, { width: 14, height: 14, color: '#60a5fa' }),
          ' OpenAI',
        ],
      }),
      _jsx('div', {
        style: {
          fontSize: '11px',
          color: '#94a3b8',
          marginBottom: '8px',
          marginTop: '16px',
          textTransform: 'uppercase',
        },
        children: 'MCP Servers',
      }),
      _jsxs(DraggableItem, {
        nodeType: 'mcp',
        label: 'Playwright MCP',
        extraData: { server: 'playwright' },
        children: [
          _jsx(Wrench, { width: 14, height: 14, color: '#facc15' }),
          ' Playwright',
        ],
      }),
      _jsxs(DraggableItem, {
        nodeType: 'mcp',
        label: 'Repomix MCP',
        extraData: { server: 'repomix' },
        children: [
          _jsx(Wrench, { width: 14, height: 14, color: '#facc15' }),
          ' Repomix',
        ],
      }),
      _jsx('div', {
        style: {
          fontSize: '11px',
          color: '#94a3b8',
          marginBottom: '8px',
          marginTop: '16px',
          textTransform: 'uppercase',
        },
        children: 'Databases',
      }),
      _jsxs(DraggableItem, {
        nodeType: 'database',
        label: 'Postgres',
        extraData: { dbType: 'PostgreSQL 17' },
        children: [
          _jsx(Database, { width: 14, height: 14, color: '#4ade80' }),
          ' Postgres',
        ],
      }),
      _jsxs(DraggableItem, {
        nodeType: 'database',
        label: 'Qdrant Vector',
        extraData: { dbType: 'Vector DB' },
        children: [
          _jsx(Database, { width: 14, height: 14, color: '#4ade80' }),
          ' Qdrant',
        ],
      }),
      _jsx('div', {
        style: {
          fontSize: '11px',
          color: '#94a3b8',
          marginBottom: '8px',
          marginTop: '16px',
          textTransform: 'uppercase',
        },
        children: 'Sandbox',
      }),
      _jsxs(DraggableItem, {
        nodeType: 'sandbox',
        label: 'Node.js Sandbox',
        extraData: { language: 'node', isolated: true },
        children: [
          _jsx(Shield, { width: 14, height: 14, color: '#10b981' }),
          ' Node.js',
        ],
      }),
      _jsxs(DraggableItem, {
        nodeType: 'sandbox',
        label: 'Python Sandbox',
        extraData: { language: 'python', isolated: true },
        children: [
          _jsx(Shield, { width: 14, height: 14, color: '#10b981' }),
          ' Python',
        ],
      }),
      _jsxs(DraggableItem, {
        nodeType: 'sandbox',
        label: 'Bash Sandbox',
        extraData: { language: 'bash', isolated: true },
        children: [
          _jsx(Shield, { width: 14, height: 14, color: '#10b981' }),
          ' Bash',
        ],
      }),
    ],
  });
}

import { useSwarm } from '../hooks/useSwarm';

// ── Main Builder Component ───────────────────────────────────────────────────
let id = 0;
const getId = () => `dndnode_${id++}`;
export function SwarmBuilder({ events = [] }) {
  const reactFlowWrapper = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const { delegate } = useSwarm();
  // Load architecture from backend on mount
  React.useEffect(() => {
    fetch('http://localhost:8082/api/swarm/architecture')
      .then((res) => res.json())
      .then((data) => {
        if (data?.nodes && data?.edges) {
          setNodes(data.nodes || []);
          setEdges(data.edges || []);
        }
      })
      .catch((err) => console.error('Failed to load architecture', err));
  }, [setNodes, setEdges]);
  // Monitor live events to animate edges
  React.useEffect(() => {
    if (!events || events.length === 0) return;
    const latestEvent = events[0];
    if (!latestEvent) return;
    if (
      latestEvent.eventType === 'peer_working' ||
      latestEvent.eventType === 'delegation_sent'
    ) {
      setEdges((eds) =>
        eds.map((e) => ({
          ...e,
          animated: true,
          style: { stroke: '#3b82f6', strokeWidth: 3 },
        })),
      );
    } else if (
      latestEvent.eventType === 'task_completed' ||
      latestEvent.eventType === 'peer_completed'
    ) {
      setEdges((eds) =>
        eds.map((e) => ({
          ...e,
          animated: false,
          style: { stroke: '#22c55e', strokeWidth: 2 },
        })),
      );
      setIsRunning(false);
    } else if (
      latestEvent.eventType === 'task_failed' ||
      latestEvent.eventType === 'peer_error'
    ) {
      setEdges((eds) =>
        eds.map((e) => ({
          ...e,
          animated: false,
          style: { stroke: '#ef4444', strokeWidth: 2 },
        })),
      );
      setIsRunning(false);
    }
  }, [events, setEdges]);
  const onConnect = useCallback(
    (params) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: '#3b82f6', strokeWidth: 2 },
          },
          eds,
        ),
      ),
    [setEdges],
  );
  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);
  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      const label = event.dataTransfer.getData('application/reactflow-label');
      const dataStr = event.dataTransfer.getData('application/reactflow-data');
      if (typeof type === 'undefined' || !type) return;
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      let parsedData = {};
      try {
        parsedData = JSON.parse(dataStr);
      } catch {
        // invalid JSON, use empty defaults
      }
      const newNode = {
        id: getId(),
        type,
        position,
        data: { label, ...parsedData },
      };
      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes],
  );
  const handleExport = () => {
    if (reactFlowInstance) {
      const flow = reactFlowInstance.toObject();
      const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(flow, null, 2))}`;
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute('href', dataStr);
      downloadAnchorNode.setAttribute('download', 'swarm_architecture.json');
      document.body.appendChild(downloadAnchorNode); // required for firefox
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      toast.success('Architecture exported to JSON');
    }
  };
  const handleSave = async () => {
    if (reactFlowInstance) {
      try {
        const flow = reactFlowInstance.toObject();
        await fetch('http://localhost:8082/api/swarm/architecture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(flow),
        });
        toast.success('Architecture saved to backend');
      } catch {
        toast.error('Failed to save architecture');
      }
    }
  };
  const handleExecute = async () => {
    if (!reactFlowInstance) return;
    const currentNodes = reactFlowInstance.getNodes();
    const currentEdges = reactFlowInstance.getEdges();
    // Find all agent nodes in the graph
    const agentNodes = currentNodes.filter(
      (n) => n.type === 'agent' && n.data?.['peerId'],
    );
    if (agentNodes.length === 0) {
      toast.error('No agents found in the architecture');
      return;
    }
    const targets = agentNodes.map((n) => n.data['peerId']);
    const prompt = window.prompt('Enter task prompt for the selected agents:');
    if (!prompt) return;
    setIsRunning(true);
    toast.info(`Delegating task to ${targets.length} agents...`);
    // Animate connected edges to simulate data flow
    const connectedEdges = currentEdges.filter((e) =>
      agentNodes.some((n) => n.id === e.source || n.id === e.target),
    );
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        animated: connectedEdges.some((ce) => ce.id === e.id),
        style: {
          stroke: connectedEdges.some((ce) => ce.id === e.id)
            ? '#3b82f6'
            : '#334155',
          strokeWidth: 2,
        },
      })),
    );
    try {
      // Execute via actual delegate logic
      await delegate(prompt, 'parallel', targets);
      toast.success('Task execution started!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to start execution');
      setIsRunning(false);
      // Reset edge animations on error
      setEdges((eds) =>
        eds.map((e) => ({
          ...e,
          animated: false,
        })),
      );
    }
  };
  return _jsx('div', {
    style: { display: 'flex', height: '100%', width: '100%' },
    children: _jsxs(ReactFlowProvider, {
      children: [
        _jsx(Sidebar, {}),
        _jsx('div', {
          style: { flex: 1, position: 'relative' },
          ref: reactFlowWrapper,
          children: _jsxs(ReactFlow, {
            nodes: nodes,
            edges: edges,
            onNodesChange: onNodesChange,
            onEdgesChange: onEdgesChange,
            onConnect: onConnect,
            onInit: setReactFlowInstance,
            onDrop: onDrop,
            onDragOver: onDragOver,
            nodeTypes: nodeTypes,
            edgeTypes: edgeTypes,
            fitView: true,
            style: { background: '#0a0a0f' },
            proOptions: { hideAttribution: true },
            children: [
              _jsx(Background, { color: '#1e293b', gap: 24 }),
              _jsx(Controls, {
                style: { background: '#1e293b', borderColor: '#334155' },
              }),
              _jsx(Panel, {
                position: 'top-right',
                children: _jsxs('div', {
                  style: { display: 'flex', gap: '8px' },
                  children: [
                    _jsxs('button', {
                      type: 'button',
                      onClick: handleSave,
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#e2e8f0',
                        fontSize: '12px',
                        cursor: 'pointer',
                      },
                      children: [_jsx(Save, { width: 14, height: 14 }), 'Save'],
                    }),
                    _jsxs('button', {
                      type: 'button',
                      onClick: handleExport,
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#e2e8f0',
                        fontSize: '12px',
                        cursor: 'pointer',
                      },
                      children: [
                        _jsx(Download, { width: 14, height: 14 }),
                        'Export',
                      ],
                    }),
                    _jsxs('button', {
                      type: 'button',
                      onClick: handleExecute,
                      disabled: isRunning || nodes.length === 0,
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        background: isRunning ? '#1e293b' : '#22c55e',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '12px',
                        cursor:
                          isRunning || nodes.length === 0
                            ? 'not-allowed'
                            : 'pointer',
                      },
                      children: [
                        isRunning
                          ? _jsx(Bot, {
                              width: 14,
                              height: 14,
                              className: 'animate-pulse',
                            })
                          : _jsx(Play, { width: 14, height: 14 }),
                        isRunning ? 'Running...' : 'Execute',
                      ],
                    }),
                  ],
                }),
              }),
            ],
          }),
        }),
      ],
    }),
  });
}
