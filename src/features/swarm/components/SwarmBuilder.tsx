import {
  addEdge,
  Background,
  BaseEdge,
  type Connection,
  Controls,
  type Edge,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  type Node,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import React, { useCallback, useRef, useState } from 'react';
import '@xyflow/react/dist/style.css';
import { Bot, Database, Download, Image as ImageIcon, Play, Save, Shield, Wrench } from 'lucide-react';
import { toast } from 'sonner';

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

export function AgentNode({ data }: { data: any }) {
  return (
    <div style={{ ...nodeStyle, border: '2px solid #3b82f6' }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', marginBottom: '8px' }}>
        <Bot size={16} color="#60a5fa" />
        {data.label}
      </div>
      <div style={{ color: '#94a3b8', fontSize: '10px' }}>Model: {data.model || 'Unknown'}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export function McpNode({ data }: { data: any }) {
  return (
    <div style={{ ...nodeStyle, border: '2px solid #eab308' }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', marginBottom: '8px' }}>
        <Wrench size={16} color="#facc15" />
        {data.label}
      </div>
      <div style={{ color: '#94a3b8', fontSize: '10px' }}>Server: {data.server || 'Local'}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export function DbNode({ data }: { data: any }) {
  return (
    <div style={{ ...nodeStyle, border: '2px solid #22c55e' }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', marginBottom: '8px' }}>
        <Database size={16} color="#4ade80" />
        {data.label}
      </div>
      <div style={{ color: '#94a3b8', fontSize: '10px' }}>Type: {data.dbType || 'SQL'}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export function SandboxNode({ data }: { data: any }) {
  return (
    <div style={{ ...nodeStyle, border: '2px solid #10b981', background: '#0f2e1f' }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', marginBottom: '8px' }}>
        <Shield size={16} color="#10b981" />
        {data.label}
      </div>
      <div style={{ color: '#94a3b8', fontSize: '10px' }}>
        {data.language || 'node'} · {data.isolated ? 'Docker' : 'Process'}
      </div>
      <div
        style={{
          color: '#10b981',
          fontSize: '9px',
          marginTop: '4px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        Isolated Sandbox
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = {
  agent: AgentNode,
  mcp: McpNode,
  database: DbNode,
  sandbox: SandboxNode,
};

export function MediaEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}: any) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} id={id} />
      <EdgeLabelRenderer>
        <div
          style={{
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
          }}
          className="nodrag nopan"
        >
          <ImageIcon size={12} color="#60a5fa" />
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes = {
  media: MediaEdge,
};

// ── Sidebar for Draggable Nodes ──────────────────────────────────────────────

function Sidebar() {
  const onDragStart = (event: React.DragEvent, nodeType: string, label: string, extraData: any = {}) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label);
    event.dataTransfer.setData('application/reactflow-data', JSON.stringify(extraData));
    event.dataTransfer.effectAllowed = 'move';
  };

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

  return (
    <div
      style={{
        width: '250px',
        background: '#0f172a',
        borderRight: '1px solid #1e293b',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#e2e8f0', marginBottom: '16px' }}>Toolbox</div>

      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' }}>Agents</div>
      <div
        style={itemStyle}
        onDragStart={(e) =>
          onDragStart(e, 'agent', 'Claude Agent', { model: 'claude-3-5-sonnet', peerId: 'claudehydra' })
        }
        draggable
      >
        <Bot size={14} color="#60a5fa" /> Claude
      </div>
      <div
        style={itemStyle}
        onDragStart={(e) =>
          onDragStart(e, 'agent', 'DeepSeek Agent', { model: 'deepseek-coder', peerId: 'deepseekhydra' })
        }
        draggable
      >
        <Bot size={14} color="#60a5fa" /> DeepSeek
      </div>
      <div
        style={itemStyle}
        onDragStart={(e) => onDragStart(e, 'agent', 'Gemini Agent', { model: 'gemini-1.5-pro', peerId: 'geminihydra' })}
        draggable
      >
        <Bot size={14} color="#60a5fa" /> Gemini
      </div>
      <div
        style={itemStyle}
        onDragStart={(e) => onDragStart(e, 'agent', 'Grok Agent', { model: 'grok-beta', peerId: 'grokhydra' })}
        draggable
      >
        <Bot size={14} color="#60a5fa" /> Grok
      </div>
      <div
        style={itemStyle}
        onDragStart={(e) => onDragStart(e, 'agent', 'OpenAI Agent', { model: 'gpt-4o', peerId: 'openaihydra' })}
        draggable
      >
        <Bot size={14} color="#60a5fa" /> OpenAI
      </div>

      <div
        style={{
          fontSize: '11px',
          color: '#94a3b8',
          marginBottom: '8px',
          marginTop: '16px',
          textTransform: 'uppercase',
        }}
      >
        MCP Servers
      </div>
      <div
        style={itemStyle}
        onDragStart={(e) => onDragStart(e, 'mcp', 'Playwright MCP', { server: 'playwright' })}
        draggable
      >
        <Wrench size={14} color="#facc15" /> Playwright
      </div>
      <div style={itemStyle} onDragStart={(e) => onDragStart(e, 'mcp', 'Repomix MCP', { server: 'repomix' })} draggable>
        <Wrench size={14} color="#facc15" /> Repomix
      </div>

      <div
        style={{
          fontSize: '11px',
          color: '#94a3b8',
          marginBottom: '8px',
          marginTop: '16px',
          textTransform: 'uppercase',
        }}
      >
        Databases
      </div>
      <div
        style={itemStyle}
        onDragStart={(e) => onDragStart(e, 'database', 'Postgres', { dbType: 'PostgreSQL 17' })}
        draggable
      >
        <Database size={14} color="#4ade80" /> Postgres
      </div>
      <div
        style={itemStyle}
        onDragStart={(e) => onDragStart(e, 'database', 'Qdrant Vector', { dbType: 'Vector DB' })}
        draggable
      >
        <Database size={14} color="#4ade80" /> Qdrant
      </div>

      <div
        style={{
          fontSize: '11px',
          color: '#94a3b8',
          marginBottom: '8px',
          marginTop: '16px',
          textTransform: 'uppercase',
        }}
      >
        Sandbox
      </div>
      <div
        style={itemStyle}
        onDragStart={(e) => onDragStart(e, 'sandbox', 'Node.js Sandbox', { language: 'node', isolated: true })}
        draggable
      >
        <Shield size={14} color="#10b981" /> Node.js
      </div>
      <div
        style={itemStyle}
        onDragStart={(e) => onDragStart(e, 'sandbox', 'Python Sandbox', { language: 'python', isolated: true })}
        draggable
      >
        <Shield size={14} color="#10b981" /> Python
      </div>
      <div
        style={itemStyle}
        onDragStart={(e) => onDragStart(e, 'sandbox', 'Bash Sandbox', { language: 'bash', isolated: true })}
        draggable
      >
        <Shield size={14} color="#10b981" /> Bash
      </div>
    </div>
  );
}

import { useSwarm } from '../hooks/useSwarm';

// ── Main Builder Component ───────────────────────────────────────────────────

let id = 0;
const getId = () => `dndnode_${id++}`;

export function SwarmBuilder({ events = [] }: { events?: any[] }) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const { delegate } = useSwarm();

  // Load architecture from backend on mount
  React.useEffect(() => {
    fetch('http://localhost:8082/api/swarm/architecture')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.nodes && data.edges) {
          setNodes(data.nodes || []);
          setEdges(data.edges || []);
        }
      })
      .catch((err) => console.error('Failed to load architecture', err));
  }, [setNodes, setEdges]);

  // Monitor live events to animate edges
  React.useEffect(() => {
    if (!events || events.length === 0) return;

    const latestEvent = events[0]; // Assuming events are unshifted (newest first)
    if (latestEvent.eventType === 'peer_working' || latestEvent.eventType === 'delegation_sent') {
      setEdges((eds) =>
        eds.map((e) => ({
          ...e,
          animated: true,
          style: { stroke: '#3b82f6', strokeWidth: 3 },
        })),
      );
    } else if (latestEvent.eventType === 'task_completed' || latestEvent.eventType === 'peer_completed') {
      setEdges((eds) =>
        eds.map((e) => ({
          ...e,
          animated: false,
          style: { stroke: '#22c55e', strokeWidth: 2 },
        })),
      );
      setIsRunning(false);
    } else if (latestEvent.eventType === 'task_failed' || latestEvent.eventType === 'peer_error') {
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
    (params: Connection) =>
      setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#3b82f6', strokeWidth: 2 } }, eds)),
    [setEdges],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
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
      } catch (e) {}

      const newNode: Node = {
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
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(flow, null, 2));
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
      } catch (err) {
        toast.error('Failed to save architecture');
      }
    }
  };

  const handleExecute = async () => {
    if (!reactFlowInstance) return;

    const currentNodes = reactFlowInstance.getNodes();
    const currentEdges = reactFlowInstance.getEdges();

    // Find all agent nodes in the graph
    const agentNodes = currentNodes.filter((n: Node) => n.type === 'agent' && n.data?.peerId);

    if (agentNodes.length === 0) {
      toast.error('No agents found in the architecture');
      return;
    }

    const targets = agentNodes.map((n: Node) => n.data.peerId);
    const prompt = window.prompt('Enter task prompt for the selected agents:');

    if (!prompt) return;

    setIsRunning(true);
    toast.info(`Delegating task to ${targets.length} agents...`);

    // Animate connected edges to simulate data flow
    const connectedEdges = currentEdges.filter((e: Edge) =>
      agentNodes.some((n: Node) => n.id === e.source || n.id === e.target),
    );

    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        animated: connectedEdges.some((ce: Edge) => ce.id === e.id),
        style: { stroke: connectedEdges.some((ce: Edge) => ce.id === e.id) ? '#3b82f6' : '#334155', strokeWidth: 2 },
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

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%' }}>
      <ReactFlowProvider>
        <Sidebar />
        <div style={{ flex: 1, position: 'relative' }} ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            style={{ background: '#0a0a0f' }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#1e293b" gap={24} />
            <Controls style={{ background: '#1e293b', borderColor: '#334155' }} />

            <Panel position="top-right">
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleSave}
                  style={{
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
                  }}
                >
                  <Save size={14} />
                  Save
                </button>
                <button
                  onClick={handleExport}
                  style={{
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
                  }}
                >
                  <Download size={14} />
                  Export
                </button>
                <button
                  onClick={handleExecute}
                  disabled={isRunning || nodes.length === 0}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    background: isRunning ? '#1e293b' : '#22c55e',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '12px',
                    cursor: isRunning || nodes.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isRunning ? <Bot size={14} className="animate-pulse" /> : <Play size={14} />}
                  {isRunning ? 'Running...' : 'Execute'}
                </button>
              </div>
            </Panel>
          </ReactFlow>
        </div>
      </ReactFlowProvider>
    </div>
  );
}
