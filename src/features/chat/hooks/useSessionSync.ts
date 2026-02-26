/**
 * useSessionSync — dual persistence layer (Zustand localStorage + PostgreSQL on fly.io).
 *
 * Hydrates Zustand from DB on startup if localStorage is empty.
 * All CRUD operations write to both DB and Zustand simultaneously.
 * One-time migration from localStorage → DB on first use.
 */

import { useCallback, useEffect, useRef } from 'react';
import { type ChatSession, useViewStore } from '@/stores/viewStore';
import {
  useAddMessageMutation,
  useCreateSessionMutation,
  useDeleteSessionMutation,
  useGenerateTitleMutation,
  useSessionsQuery,
  useUpdateSessionMutation,
} from './useSessions';

const MIGRATION_FLAG = 'ch-sessions-migrated-to-db';

export function useSessionSync() {
  const {
    chatSessions,
    activeSessionId,
    createSessionWithId,
    deleteSession: deleteSessionLocal,
    updateSessionTitle: updateSessionTitleLocal,
    hydrateSessions,
    selectSession,
    openTab,
    setView,
  } = useViewStore();

  const { data: dbSessions, isSuccess: dbLoaded } = useSessionsQuery();
  const createMutation = useCreateSessionMutation();
  const deleteMutation = useDeleteSessionMutation();
  const updateMutation = useUpdateSessionMutation();
  const addMessageMutation = useAddMessageMutation();
  const generateTitleMutation = useGenerateTitleMutation();

  const hydratedRef = useRef(false);

  // ── Hydrate from DB on startup ──────────────────────────────────────
  useEffect(() => {
    if (!dbLoaded || !dbSessions || hydratedRef.current) return;
    hydratedRef.current = true;

    const mapped: ChatSession[] = dbSessions.map((s) => ({
      id: s.id,
      title: s.title,
      createdAt: new Date(s.created_at).getTime(),
      updatedAt: new Date(s.updated_at ?? s.created_at).getTime(),
      messageCount: s.message_count,
    }));

    if (mapped.length > 0) {
      hydrateSessions(mapped);
    }

    // One-time migration: push any localStorage-only sessions to DB
    if (!localStorage.getItem(MIGRATION_FLAG)) {
      const localOnly = chatSessions.filter((local) => !dbSessions.some((db) => db.id === local.id));
      for (const session of localOnly) {
        createMutation.mutate({ title: session.title });
      }
      localStorage.setItem(MIGRATION_FLAG, '1');
    }
  }, [dbLoaded, dbSessions, chatSessions, hydrateSessions, createMutation]);

  // ── Synced CRUD operations ──────────────────────────────────────────

  const createSessionWithSync = useCallback(
    (title?: string) => {
      const sessionTitle = title ?? `Chat ${chatSessions.length + 1}`;
      createMutation.mutate(
        { title: sessionTitle },
        {
          onSuccess: (created) => {
            createSessionWithId(created.id, created.title);
          },
        },
      );
    },
    [chatSessions.length, createMutation, createSessionWithId],
  );

  const deleteSessionWithSync = useCallback(
    (id: string) => {
      deleteSessionLocal(id);
      deleteMutation.mutate(id);
    },
    [deleteSessionLocal, deleteMutation],
  );

  const renameSessionWithSync = useCallback(
    (id: string, newTitle: string) => {
      updateSessionTitleLocal(id, newTitle);
      updateMutation.mutate({ id, title: newTitle });
    },
    [updateSessionTitleLocal, updateMutation],
  );

  /** Ask AI to generate a session title from the first user message. */
  const generateTitleWithSync = useCallback(
    async (id: string) => {
      try {
        const result = await generateTitleMutation.mutateAsync(id);
        if (result.title) {
          updateSessionTitleLocal(id, result.title);
        }
      } catch {
        // Best-effort: substring title already set as placeholder
      }
    },
    [generateTitleMutation, updateSessionTitleLocal],
  );

  const addMessageWithSync = useCallback(
    (sessionId: string, role: string, content: string, model?: string) => {
      addMessageMutation.mutate({ sessionId, role, content, ...(model !== undefined && { model }) });
    },
    [addMessageMutation],
  );

  return {
    createSessionWithSync,
    deleteSessionWithSync,
    renameSessionWithSync,
    generateTitleWithSync,
    addMessageWithSync,
    activeSessionId,
    chatSessions,
    selectSession,
    openTab,
    setView,
    isLoading: createMutation.isPending,
  };
}
