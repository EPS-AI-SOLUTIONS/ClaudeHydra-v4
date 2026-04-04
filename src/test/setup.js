import '@testing-library/jest-dom/vitest';
// Ensure localStorage is available in jsdom environment.
// Suppress Node.js 23 localstorage warnings by overriding directly.
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
