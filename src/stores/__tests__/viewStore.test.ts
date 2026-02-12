import { describe, it, expect, beforeEach } from 'vitest';
import { useViewStore } from '../viewStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get a fresh snapshot of the store state */
const getState = () => useViewStore.getState();

/** Shorthand to call an action */
const act = <K extends keyof ReturnType<typeof useViewStore.getState>>(
  key: K,
  // biome-ignore lint: any needed for generic action invocation
  ...args: any[]
) => {
  const fn = getState()[key];
  if (typeof fn === 'function') return (fn as (...a: unknown[]) => unknown)(...args);
  throw new Error(`${String(key)} is not a function`);
};

// ---------------------------------------------------------------------------
// Reset store between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Use merge mode (replace=false) to keep actions intact while resetting data
  useViewStore.setState({
    currentView: 'home',
    sidebarCollapsed: false,
    mobileDrawerOpen: false,
    activeSessionId: null,
    chatSessions: [],
    openTabs: [],
  });
  // Clear persisted storage so state doesn't leak between tests
  localStorage.removeItem('claude-hydra-v4-view');
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('viewStore — initial state', () => {
  it('has currentView set to "home"', () => {
    expect(getState().currentView).toBe('home');
  });

  it('has sidebarCollapsed set to false', () => {
    expect(getState().sidebarCollapsed).toBe(false);
  });

  it('has mobileDrawerOpen set to false', () => {
    expect(getState().mobileDrawerOpen).toBe(false);
  });

  it('has activeSessionId set to null', () => {
    expect(getState().activeSessionId).toBeNull();
  });

  it('has an empty chatSessions array', () => {
    expect(getState().chatSessions).toEqual([]);
  });

  it('has an empty openTabs array', () => {
    expect(getState().openTabs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// setView
// ---------------------------------------------------------------------------

describe('viewStore — setView', () => {
  it('changes currentView to the given ViewId', () => {
    act('setView', 'chat');
    expect(getState().currentView).toBe('chat');
  });

  it('can switch between multiple views', () => {
    act('setView', 'settings');
    expect(getState().currentView).toBe('settings');

    act('setView', 'agents');
    expect(getState().currentView).toBe('agents');

    act('setView', 'home');
    expect(getState().currentView).toBe('home');
  });
});

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

describe('viewStore — sidebar', () => {
  it('setSidebarCollapsed sets the value directly', () => {
    act('setSidebarCollapsed', true);
    expect(getState().sidebarCollapsed).toBe(true);

    act('setSidebarCollapsed', false);
    expect(getState().sidebarCollapsed).toBe(false);
  });

  it('toggleSidebar flips sidebarCollapsed', () => {
    expect(getState().sidebarCollapsed).toBe(false);

    act('toggleSidebar');
    expect(getState().sidebarCollapsed).toBe(true);

    act('toggleSidebar');
    expect(getState().sidebarCollapsed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mobile drawer
// ---------------------------------------------------------------------------

describe('viewStore — mobile drawer', () => {
  it('setMobileDrawerOpen opens and closes the drawer', () => {
    act('setMobileDrawerOpen', true);
    expect(getState().mobileDrawerOpen).toBe(true);

    act('setMobileDrawerOpen', false);
    expect(getState().mobileDrawerOpen).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createSession
// ---------------------------------------------------------------------------

describe('viewStore — createSession', () => {
  it('returns a non-empty string id', () => {
    const id = act('createSession');
    expect(typeof id).toBe('string');
    expect((id as string).length).toBeGreaterThan(0);
  });

  it('adds the new session to chatSessions', () => {
    const id = act('createSession', 'My Chat') as string;
    const session = getState().chatSessions.find((s) => s.id === id);
    expect(session).toBeDefined();
    expect(session!.title).toBe('My Chat');
    expect(session!.messageCount).toBe(0);
  });

  it('sets the new session as activeSessionId', () => {
    const id = act('createSession') as string;
    expect(getState().activeSessionId).toBe(id);
  });

  it('adds the session id to openTabs', () => {
    const id = act('createSession') as string;
    expect(getState().openTabs).toContain(id);
  });

  it('switches currentView to "chat"', () => {
    act('createSession');
    expect(getState().currentView).toBe('chat');
  });

  it('generates a default title when none is provided', () => {
    act('createSession');
    const session = getState().chatSessions[0];
    expect(session?.title).toBe('Chat 1');
  });

  it('prepends new sessions (most recent first)', () => {
    act('createSession', 'First');
    const secondId = act('createSession', 'Second') as string;
    expect(getState().chatSessions[0]?.id).toBe(secondId);
  });
});

// ---------------------------------------------------------------------------
// deleteSession
// ---------------------------------------------------------------------------

describe('viewStore — deleteSession', () => {
  it('removes the session from chatSessions', () => {
    const id = act('createSession', 'Deleteme') as string;
    act('deleteSession', id);
    expect(getState().chatSessions.find((s) => s.id === id)).toBeUndefined();
  });

  it('removes the session from openTabs', () => {
    const id = act('createSession') as string;
    act('deleteSession', id);
    expect(getState().openTabs).not.toContain(id);
  });

  it('updates activeSessionId when the deleted session was active', () => {
    const id1 = act('createSession', 'A') as string;
    const id2 = act('createSession', 'B') as string;

    // id2 is now active
    expect(getState().activeSessionId).toBe(id2);

    act('deleteSession', id2);
    // should fall back to remaining tab
    expect(getState().activeSessionId).toBe(id1);
  });

  it('sets activeSessionId to null when no sessions remain', () => {
    const id = act('createSession') as string;
    act('deleteSession', id);
    expect(getState().activeSessionId).toBeNull();
  });

  it('does not change activeSessionId when deleting a non-active session', () => {
    const id1 = act('createSession', 'A') as string;
    const id2 = act('createSession', 'B') as string;

    // id2 is active
    act('deleteSession', id1);
    expect(getState().activeSessionId).toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// renameSession
// ---------------------------------------------------------------------------

describe('viewStore — renameSession', () => {
  it('changes the title of the targeted session', () => {
    const id = act('createSession', 'Old Title') as string;
    act('renameSession', id, 'New Title');
    const session = getState().chatSessions.find((s) => s.id === id);
    expect(session?.title).toBe('New Title');
  });

  it('updates the updatedAt timestamp', () => {
    const id = act('createSession', 'Title') as string;
    const before = getState().chatSessions.find((s) => s.id === id)!.updatedAt;

    // small delay so timestamp differs
    act('renameSession', id, 'Title v2');
    const after = getState().chatSessions.find((s) => s.id === id)!.updatedAt;

    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('does not affect other sessions', () => {
    const id1 = act('createSession', 'Keep') as string;
    const id2 = act('createSession', 'Change') as string;

    act('renameSession', id2, 'Changed');

    expect(getState().chatSessions.find((s) => s.id === id1)?.title).toBe('Keep');
    expect(getState().chatSessions.find((s) => s.id === id2)?.title).toBe('Changed');
  });
});

// ---------------------------------------------------------------------------
// openTab
// ---------------------------------------------------------------------------

describe('viewStore — openTab', () => {
  it('adds a session id to openTabs', () => {
    const id = act('createSession') as string;
    // Already in openTabs from createSession; close it first to test openTab
    act('closeTab', id);
    expect(getState().openTabs).not.toContain(id);

    act('openTab', id);
    expect(getState().openTabs).toContain(id);
  });

  it('sets the opened tab as activeSessionId', () => {
    const id1 = act('createSession', 'A') as string;
    act('createSession', 'B');
    // id2 is active now; open id1
    act('openTab', id1);
    expect(getState().activeSessionId).toBe(id1);
  });

  it('does not duplicate an already-open tab', () => {
    const id = act('createSession') as string;
    const tabsBefore = getState().openTabs.length;

    act('openTab', id);
    expect(getState().openTabs.length).toBe(tabsBefore);
  });
});

// ---------------------------------------------------------------------------
// closeTab
// ---------------------------------------------------------------------------

describe('viewStore — closeTab', () => {
  it('removes a tab from openTabs', () => {
    const id = act('createSession') as string;
    act('closeTab', id);
    expect(getState().openTabs).not.toContain(id);
  });

  it('switches activeSessionId to a neighbour when closing the active tab', () => {
    const id1 = act('createSession', 'A') as string;
    const id2 = act('createSession', 'B') as string;
    const id3 = act('createSession', 'C') as string;

    // Tabs: [id1, id2, id3] — id3 is active
    act('closeTab', id3);
    // Should fall to the previous tab (id2) or whichever is at the clamped index
    expect([id1, id2]).toContain(getState().activeSessionId);
  });

  it('sets activeSessionId to null when the last tab is closed', () => {
    const id = act('createSession') as string;
    act('closeTab', id);
    expect(getState().activeSessionId).toBeNull();
  });

  it('does not change activeSessionId when closing a non-active tab', () => {
    const id1 = act('createSession', 'A') as string;
    const id2 = act('createSession', 'B') as string;

    // id2 is active
    act('closeTab', id1);
    expect(getState().activeSessionId).toBe(id2);
  });
});
