/// <reference types="vite/client" />

declare module 'y-websocket' {
  import type { Doc } from 'yjs';

  interface AwarenessChange {
    added: number[];
    updated: number[];
    removed: number[];
  }

  class Awareness {
    getStates(): Map<number, Record<string, unknown>>;
    setLocalStateField(field: string, value: unknown): void;
    on(event: 'change', callback: (change: AwarenessChange) => void): void;
    off(event: 'change', callback: (change: AwarenessChange) => void): void;
    destroy(): void;
  }

  export class WebsocketProvider {
    constructor(serverUrl: string, roomname: string, doc: Doc, opts?: Record<string, unknown>);
    awareness: Awareness;
    wsconnected: boolean;
    synced: boolean;
    on(event: string, callback: (...args: unknown[]) => void): void;
    off(event: string, callback: (...args: unknown[]) => void): void;
    destroy(): void;
    disconnect(): void;
    connect(): void;
  }
}

declare module '@jaskier/vault-client' {
  export interface VaultHealth {
    online: boolean;
    version?: string;
    uptime_seconds?: number;
    total_secrets?: number;
    namespaces?: string[];
    last_backup?: string;
    encryption?: string;
    status?: string;
    credential_count?: number;
    namespace_count?: number;
    last_audit?: string;
    active_tickets?: number;
    rotation_services?: number;
    acl_enabled?: boolean;
  }

  export interface AuditEntry {
    timestamp: string;
    action: string;
    namespace?: string;
    service?: string;
    agent?: string;
    details?: string;
    success: boolean;
    result?: string;
  }

  export interface NamespaceServiceInfo {
    name: string;
    connected: boolean;
  }

  export interface NamespaceInfo {
    name: string;
    services: NamespaceServiceInfo[];
    total_secrets: number;
  }

  export type VaultStatusLevel = 'healthy' | 'degraded' | 'critical' | 'offline';

  export function resolveVaultStatus(health: VaultHealth | null): VaultStatusLevel;

  export const VAULT_API: {
    health: string;
    audit: string;
    panic: string;
    rotate: string;
    list: string;
    namespaces: string;
  };

  export const VAULT_DASHBOARD_URL: string;

  export const VAULT_POLLING: {
    health: number;
    audit: number;
    namespaces: number;
  };

  export const VAULT_QUERY_KEYS: {
    health: readonly string[];
    audit: readonly string[];
    list: readonly string[];
    namespaces: readonly string[];
  };

  export const VAULT_STATUS_CONFIG: Record<
    VaultStatusLevel,
    {
      color: string;
      bgColor: string;
      borderColor: string;
      label: string;
      icon: string;
      pulseClass?: string;
    }
  >;
}
