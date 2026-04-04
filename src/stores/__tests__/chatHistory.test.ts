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
  it('addMessage adds a message to the correct session', () => {
    const sessionId = getState().createSession('Test') as string;
    getState().addMessage(sessionId, {
      role: 'user',
      content: 'Hello',
    });
    const history = getState().chatHistory[sessionId];
    expect(history).toBeDefined();
    expect(history?.length).toBe(1);
    expect(history?.[0]?.content).toBe('Hello');
  });

  it('addMessage increments messageCount on the session', () => {
    const sessionId = getState().createSession('Test') as string;
    getState().addMessage(sessionId, {
      role: 'user',
      content: 'First',
    });
    getState().addMessage(sessionId, {
      role: 'assistant',
      content: 'Response',
    });
    const session = getState().sessions.find((s) => s.id === sessionId);
    expect(session?.messageCount).toBe(2);
  });

  it('clearChatHistory removes all messages for a session', () => {
    const sessionId = getState().createSession('Test') as string;
    getState().addMessage(sessionId, {
      role: 'user',
      content: 'Hello',
    });
    getState().clearChatHistory(sessionId);
    const history = getState().chatHistory[sessionId];
    expect(history).toEqual([]);
  });

  it('chatHistory for a new session is empty', () => {
    const sessionId = getState().createSession('Empty') as string;
    const history = getState().chatHistory[sessionId];
    // May be undefined or empty array depending on implementation
    expect(history === undefined || history.length === 0).toBe(true);
  });

  it('messages have auto-generated ids', () => {
    const sessionId = getState().createSession('Test') as string;
    getState().addMessage(sessionId, {
      role: 'user',
      content: 'Hello',
    });
    const msg = getState().chatHistory[sessionId]?.[0];
    expect(msg?.id).toBeDefined();
    expect(typeof msg?.id).toBe('string');
  });
});
