/** Jaskier Shared Pattern */
// src/shared/api/partner-client.ts
/**
 * ClaudeHydra — Partner API Client (GeminiHydra cross-query)
 * ===========================================================
 * Fetches sessions from the partner Hydra (GeminiHydra) backend.
 * This is CH-specific and not part of the shared @jaskier/hydra-app API.
 */
import { env } from '../config/env';

const PARTNER_BASE = import.meta.env.PROD ? 'https://geminihydra-v15-backend.fly.dev/api' : '/partner-api';
const PARTNER_AUTH_SECRET = env.VITE_PARTNER_AUTH_SECRET;
export async function fetchPartnerSessions() {
  const res = await fetch(`${PARTNER_BASE}/sessions`, {
    signal: AbortSignal.timeout(5000),
    ...(PARTNER_AUTH_SECRET ? { headers: { Authorization: `Bearer ${PARTNER_AUTH_SECRET}` } } : {}),
  });
  if (!res.ok) throw new Error(`Partner API error: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.sessions ?? []);
}
export async function fetchPartnerSession(id) {
  const res = await fetch(`${PARTNER_BASE}/sessions/${id}`, {
    signal: AbortSignal.timeout(10000),
    ...(PARTNER_AUTH_SECRET ? { headers: { Authorization: `Bearer ${PARTNER_AUTH_SECRET}` } } : {}),
  });
  if (!res.ok) throw new Error(`Partner API error: ${res.status}`);
  return res.json();
}
