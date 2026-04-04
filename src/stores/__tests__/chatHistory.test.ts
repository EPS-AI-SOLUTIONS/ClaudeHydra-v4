import { beforeEach, describe, expect, it } from 'vitest';
import { useViewStore } from '../viewStore';

const getState = () => useViewStore.getState();

beforeEach(() => {
  useViewStore.setState({
    currentView: 'home',
    sidebarCollapsed: false,
    currentSessionId: null,
    sessions: [],
    tabs: [],
    activeTabId: null,
    chatHistory: {},
  });
  localStorage.removeItem('claude-hydra-v4-view');
});

describe('viewStore — chat history', () => {
  it('addMessageToSession adds a message to the correct session', () => {
    const sessionId = getState().createSession('Test') as string;
    getState().addMessageToSession(sessionId, {
      role: 'user',
      content: 'Hello',
    });
    const history = getState().chatHistory[sessionId];
    expect(history).toBeDefined();
    expect(history?.length).toBe(1);
    expect(history?.[0]?.content).toBe('Hello');
  });

  it('addMessageToSession appends multiple messages', () => {
    const sessionId = getState().createSession('Test') as string;
    getState().addMessageToSession(sessionId, {
      role: 'user',
      content: 'First',
    });
    getState().addMessageToSession(sessionId, {
      role: 'assistant',
      content: 'Response',
    });
    const history = getState().chatHistory[sessionId];
    expect(history?.length).toBe(2);
    expect(history?.[0]?.role).toBe('user');
    expect(history?.[1]?.role).toBe('assistant');
  });

  it('clearChatHistory via setState removes all messages for a session', () => {
    const sessionId = getState().createSession('Test') as string;
    getState().addMessageToSession(sessionId, {
      role: 'user',
      content: 'Hello',
    });
    // Clear by setting empty array
    useViewStore.setState((state) => ({
      chatHistory: { ...state.chatHistory, [sessionId]: [] },
    }));
    const history = getState().chatHistory[sessionId];
    expect(history).toEqual([]);
  });

  it('chatHistory for a new session is empty', () => {
    const sessionId = getState().createSession('Empty') as string;
    const history = getState().chatHistory[sessionId];
    // May be undefined or empty array depending on implementation
    expect(history === undefined || history.length === 0).toBe(true);
  });

  it('messages preserve provided id', () => {
    const sessionId = getState().createSession('Test') as string;
    getState().addMessageToSession(sessionId, {
      id: 'msg-001',
      role: 'user',
      content: 'Hello',
    });
    const msg = getState().chatHistory[sessionId]?.[0];
    expect(msg?.id).toBe('msg-001');
  });
});
