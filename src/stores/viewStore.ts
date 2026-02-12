/**
 * viewStore — Zustand store for SPA view routing & sidebar state.
 * Ported from ClaudeHydra v3 claudeStore (sidebarCollapsed, activeSessionId,
 * chatSessions, openTabs, navigation logic from Sidebar.tsx).
 *
 * Uses client-side view switching. Can be replaced with react-router later.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ViewId = 'home' | 'chat' | 'agents' | 'history' | 'settings';

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview?: string;
}

interface ViewState {
  /** Currently active view / page */
  currentView: ViewId;
  /** Whether the sidebar is collapsed */
  sidebarCollapsed: boolean;
  /** Whether the mobile drawer is open */
  mobileDrawerOpen: boolean;
  /** Active chat session ID */
  activeSessionId: string | null;
  /** List of chat sessions (summary data for sidebar) */
  chatSessions: ChatSession[];
  /** IDs of open tabs */
  openTabs: string[];

  // Actions
  setView: (view: ViewId) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setMobileDrawerOpen: (open: boolean) => void;
  setActiveSessionId: (id: string | null) => void;
  createSession: (title?: string) => string;
  deleteSession: (id: string) => void;
  renameSession: (id: string, newTitle: string) => void;
  openTab: (sessionId: string) => void;
  closeTab: (sessionId: string) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useViewStore = create<ViewState>()(
  persist(
    (set, get) => ({
      currentView: 'home',
      sidebarCollapsed: false,
      mobileDrawerOpen: false,
      activeSessionId: null,
      chatSessions: [],
      openTabs: [],

      setView: (view) => set({ currentView: view }),

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setMobileDrawerOpen: (open) => set({ mobileDrawerOpen: open }),

      setActiveSessionId: (id) => set({ activeSessionId: id }),

      createSession: (title) => {
        const id = crypto.randomUUID();
        const now = Date.now();
        const sessions = get().chatSessions;
        const sessionTitle = title ?? `Chat ${sessions.length + 1}`;

        set((state) => ({
          chatSessions: [
            {
              id,
              title: sessionTitle,
              createdAt: now,
              updatedAt: now,
              messageCount: 0,
            },
            ...state.chatSessions,
          ],
          activeSessionId: id,
          openTabs: state.openTabs.includes(id) ? state.openTabs : [...state.openTabs, id],
          currentView: 'chat',
        }));

        return id;
      },

      deleteSession: (id) =>
        set((state) => {
          const newSessions = state.chatSessions.filter((s) => s.id !== id);
          const newTabs = state.openTabs.filter((t) => t !== id);
          let newActiveId = state.activeSessionId;

          if (state.activeSessionId === id) {
            const closedIdx = state.openTabs.indexOf(id);
            if (newTabs.length > 0) {
              newActiveId = newTabs[Math.min(closedIdx, newTabs.length - 1)] ?? null;
            } else {
              newActiveId = newSessions.length > 0 ? (newSessions[0]?.id ?? null) : null;
            }
          }

          return {
            chatSessions: newSessions,
            activeSessionId: newActiveId,
            openTabs: newTabs,
          };
        }),

      renameSession: (id, newTitle) =>
        set((state) => ({
          chatSessions: state.chatSessions.map((s) =>
            s.id === id ? { ...s, title: newTitle, updatedAt: Date.now() } : s,
          ),
        })),

      openTab: (sessionId) =>
        set((state) => ({
          openTabs: state.openTabs.includes(sessionId) ? state.openTabs : [...state.openTabs, sessionId],
          activeSessionId: sessionId,
        })),

      closeTab: (sessionId) =>
        set((state) => {
          const newTabs = state.openTabs.filter((t) => t !== sessionId);
          let newActiveId = state.activeSessionId;

          if (state.activeSessionId === sessionId) {
            const closedIdx = state.openTabs.indexOf(sessionId);
            if (newTabs.length > 0) {
              newActiveId = newTabs[Math.min(closedIdx, newTabs.length - 1)] ?? null;
            } else {
              newActiveId = null;
            }
          }

          return {
            openTabs: newTabs,
            activeSessionId: newActiveId,
          };
        }),
    }),
    {
      name: 'claude-hydra-v4-view',
      version: 1,
      partialize: (state) => ({
        currentView: state.currentView,
        sidebarCollapsed: state.sidebarCollapsed,
        activeSessionId: state.activeSessionId,
        chatSessions: state.chatSessions,
        openTabs: state.openTabs,
      }),
    },
  ),
);
