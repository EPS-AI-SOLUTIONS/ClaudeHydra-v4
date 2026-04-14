/**
 * useSwarm — Swarm IPC state management
 *
 * Provides peer discovery, task delegation, real-time SSE events,
 * and task history for the SwarmView.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

// ── API Base ─────────────────────────────────────────────────────────────────
const API_BASE = 'http://localhost:8082';
// ── Hook ─────────────────────────────────────────────────────────────────────
export function useSwarm() {
  const [peers, setPeers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isDelegating, setIsDelegating] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const eventSourceRef = useRef(null);
  // ── Discover peers ──────────────────────────────────────────────────────
  const discover = useCallback(async () => {
    setIsDiscovering(true);
    try {
      const resp = await fetch(`${API_BASE}/api/swarm/discover`);
      const data = await resp.json();
      setPeers(data.peers || []);
    } catch (err) {
      console.error('Swarm discover failed:', err);
    } finally {
      setIsDiscovering(false);
    }
  }, []);
  // ── Load peers (cached) ─────────────────────────────────────────────────
  const loadPeers = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/swarm/peers`);
      const data = await resp.json();
      setPeers(data);
    } catch (err) {
      console.error('Swarm peers load failed:', err);
    }
  }, []);
  // ── Load tasks ──────────────────────────────────────────────────────────
  const loadTasks = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/swarm/tasks`);
      const data = await resp.json();
      setTasks(data);
    } catch (err) {
      console.error('Swarm tasks load failed:', err);
    }
  }, []);
  // ── Load task details ───────────────────────────────────────────────────
  const loadTask = useCallback(async (taskId) => {
    try {
      const resp = await fetch(`${API_BASE}/api/swarm/tasks/${taskId}`);
      const data = await resp.json();
      setSelectedTask(data);
      return data;
    } catch (err) {
      console.error('Swarm task load failed:', err);
      return null;
    }
  }, []);
  // ── Delegate task ───────────────────────────────────────────────────────
  const delegate = useCallback(
    async (
      prompt,
      pattern = 'parallel',
      targets = [],
      timeoutSecs = 120,
      attachments = [],
    ) => {
      setIsDelegating(true);
      try {
        const resp = await fetch(`${API_BASE}/api/swarm/delegate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            pattern,
            targets,
            timeout_secs: timeoutSecs,
            attachments,
          }),
        });
        const data = await resp.json();
        // Refresh tasks list
        setTimeout(() => loadTasks(), 500);
        return data;
      } catch (err) {
        console.error('Swarm delegate failed:', err);
        return null;
      } finally {
        setIsDelegating(false);
      }
    },
    [loadTasks],
  );
  // ── SSE event stream ────────────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/swarm/events`);
    eventSourceRef.current = es;
    const handleEvent = (e) => {
      try {
        const event = JSON.parse(e.data);
        setEvents((prev) => [event, ...prev].slice(0, 100));
        // Auto-refresh tasks on completion events
        if (
          event.eventType === 'task_completed' ||
          event.eventType === 'task_failed'
        ) {
          loadTasks();
        }
      } catch {
        // ping/keepalive — ignore
      }
    };
    // Listen for all event types
    const eventTypes = [
      'task_created',
      'delegation_sent',
      'delegation_acknowledged',
      'peer_working',
      'partial_result',
      'peer_completed',
      'peer_error',
      'peer_timeout',
      'task_completed',
      'task_failed',
      'task_cancelled',
      'peer_discovered',
      'peer_lost',
      'attachment_received',
      'media_stream_chunk',
    ];
    for (const type of eventTypes) {
      es.addEventListener(type, handleEvent);
    }
    es.onerror = () => {
      // Auto-reconnect handled by browser
    };
    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [loadTasks]);
  // ── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    loadPeers();
    loadTasks();
  }, [loadPeers, loadTasks]);
  // ── Derived stats ───────────────────────────────────────────────────────
  const onlinePeers = peers.filter((p) => p.status === 'online');
  const stats = {
    totalPeers: peers.length,
    onlinePeers: onlinePeers.length,
    totalTasks: tasks.length,
    completedTasks: tasks.filter((t) => t.status === 'completed').length,
    failedTasks: tasks.filter((t) => t.status === 'failed').length,
    runningTasks: tasks.filter((t) => t.status === 'running').length,
  };
  return {
    peers,
    tasks,
    events,
    stats,
    selectedTask,
    isDiscovering,
    isDelegating,
    discover,
    loadPeers,
    loadTasks,
    loadTask,
    delegate,
    setSelectedTask,
  };
}
