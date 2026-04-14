// @ts-nocheck
import * as matchers from '@testing-library/jest-dom/matchers';
import { expect, vi } from 'vitest';

expect.extend(matchers);
// Ensure localStorage is available in jsdom environment.
const store = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => {
      store[key] = value;
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      for (const key of Object.keys(store)) delete store[key];
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index) => Object.keys(store)[index] ?? null,
  },
  writable: true,
  configurable: true,
});
// Mock indexedDB for jsdom (used by WasmWorker Cache API)
if (typeof globalThis.indexedDB === 'undefined') {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: {
      open: () => ({
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      }),
      deleteDatabase: () => ({ onsuccess: null, onerror: null }),
    },
    writable: true,
    configurable: true,
  });
}
global.fetch = vi.fn(() =>
  Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
);
