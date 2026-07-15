/**
 * Minimal in-memory chrome.storage + runtime stub for unit/integration tests.
 */

type StorageArea = {
  get: (keys?: string | string[] | Record<string, unknown> | null) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
  clear: () => Promise<void>;
};

function makeArea(store: Record<string, unknown>): StorageArea {
  return {
    async get(keys) {
      if (keys == null) return { ...store };
      if (typeof keys === 'string') {
        return keys in store ? { [keys]: store[keys] } : {};
      }
      if (Array.isArray(keys)) {
        const out: Record<string, unknown> = {};
        for (const k of keys) {
          if (k in store) out[k] = store[k];
        }
        return out;
      }
      const out: Record<string, unknown> = { ...keys };
      for (const k of Object.keys(keys)) {
        if (k in store) out[k] = store[k];
      }
      return out;
    },
    async set(items) {
      Object.assign(store, items);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) delete store[k];
    },
    async clear() {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
}

export type ChromeMock = {
  localStore: Record<string, unknown>;
  sessionStore: Record<string, unknown>;
  lastError: { message: string } | undefined;
  sendMessageImpl: ((msg: unknown, cb: (res: unknown) => void) => void) | null;
};

export function installChromeMock(initial?: {
  local?: Record<string, unknown>;
  session?: Record<string, unknown>;
}): ChromeMock {
  const localStore = { ...(initial?.local ?? {}) };
  const sessionStore = { ...(initial?.session ?? {}) };
  const state: ChromeMock = {
    localStore,
    sessionStore,
    lastError: undefined,
    sendMessageImpl: null,
  };

  const chromeMock = {
    storage: {
      local: makeArea(localStore),
      session: makeArea(sessionStore),
      onChanged: {
        addListener: () => undefined,
        removeListener: () => undefined,
      },
    },
    runtime: {
      get lastError() {
        return state.lastError;
      },
      sendMessage: (msg: unknown, cb: (res: unknown) => void) => {
        if (state.sendMessageImpl) {
          state.sendMessageImpl(msg, cb);
          return;
        }
        cb({ ok: false, error: 'No sendMessageImpl' });
      },
      getURL: (path: string) => `chrome-extension://joblens-test/${path}`,
      openOptionsPage: () => undefined,
    },
    tabs: {
      query: async () => [] as chrome.tabs.Tab[],
      sendMessage: async () => undefined,
      create: async () => ({ id: 1 }) as chrome.tabs.Tab,
      onUpdated: {
        addListener: () => undefined,
        removeListener: () => undefined,
      },
    },
    sidePanel: {
      setPanelBehavior: async () => undefined,
      open: async () => undefined,
    },
  };

  (globalThis as unknown as { chrome: typeof chromeMock }).chrome = chromeMock;
  return state;
}
