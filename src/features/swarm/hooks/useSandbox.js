/**
 * useSandbox — Sandbox Environment state management
 *
 * Provides sandbox session lifecycle, code execution, and execution history
 * for the Swarm Sandbox panel.
 */
import { useCallback, useEffect, useState } from 'react';

// ── API Base ─────────────────────────────────────────────────────────────────
const API_BASE = 'http://localhost:8082';
// ── Hook ─────────────────────────────────────────────────────────────────────
export function useSandbox() {
  const [sessions, setSessions] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [health, setHealth] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [latestExecution, setLatestExecution] = useState(null);
  // ── Health check ─────────────────────────────────────────────────────────
  const checkHealth = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/sandbox/health`);
      const data = await resp.json();
      setHealth(data);
      return data;
    } catch (err) {
      console.error('Sandbox health check failed:', err);
      return null;
    }
  }, []);
  // ── Create session ───────────────────────────────────────────────────────
  const createSession = useCallback(async (language, limits) => {
    setIsCreating(true);
    try {
      const resp = await fetch(`${API_BASE}/api/sandbox/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, limits }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setSessions((prev) => [data, ...prev]);
      }
      return data;
    } catch (err) {
      console.error('Sandbox create failed:', err);
      return null;
    } finally {
      setIsCreating(false);
    }
  }, []);
  // ── Execute code ─────────────────────────────────────────────────────────
  const executeCode = useCallback(async (code, language, sessionId, timeoutSecs) => {
    setIsExecuting(true);
    setLatestExecution(null);
    try {
      const resp = await fetch(`${API_BASE}/api/sandbox/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          language: sessionId ? undefined : language,
          session_id: sessionId,
          timeout_secs: timeoutSecs,
        }),
      });
      const data = await resp.json();
      setLatestExecution(data);
      setExecutions((prev) => [data, ...prev].slice(0, 100));
      return data;
    } catch (err) {
      console.error('Sandbox execute failed:', err);
      return null;
    } finally {
      setIsExecuting(false);
    }
  }, []);
  // ── Load sessions ────────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/sandbox/sessions`);
      const data = await resp.json();
      setSessions(data);
    } catch (err) {
      console.error('Sandbox sessions load failed:', err);
    }
  }, []);
  // ── Load executions ──────────────────────────────────────────────────────
  const loadExecutions = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/sandbox/executions`);
      const data = await resp.json();
      setExecutions(data);
    } catch (err) {
      console.error('Sandbox executions load failed:', err);
    }
  }, []);
  // ── Destroy session ──────────────────────────────────────────────────────
  const destroySession = useCallback(async (sessionId) => {
    try {
      await fetch(`${API_BASE}/api/sandbox/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      console.error('Sandbox destroy failed:', err);
    }
  }, []);
  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    checkHealth();
    loadSessions();
    loadExecutions();
  }, [checkHealth, loadSessions, loadExecutions]);
  // ── Derived stats ────────────────────────────────────────────────────────
  const stats = {
    activeSessions: sessions.filter((s) => s.status === 'ready').length,
    totalSessions: sessions.length,
    totalExecutions: executions.length,
    successRate:
      executions.length > 0
        ? Math.round((executions.filter((e) => e.status === 'success').length / executions.length) * 100)
        : 0,
  };
  return {
    sessions,
    executions,
    health,
    stats,
    latestExecution,
    isCreating,
    isExecuting,
    checkHealth,
    createSession,
    executeCode,
    loadSessions,
    loadExecutions,
    destroySession,
  };
}
