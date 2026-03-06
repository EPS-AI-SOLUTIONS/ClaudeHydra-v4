// src/stores/utils.ts
export const MAX_SESSIONS = 50;
export const MAX_TITLE_LENGTH = 100;

export function sanitizeTitle(title: string, maxLen: number): string {
  return title.trim().slice(0, maxLen) || 'New Chat';
}
