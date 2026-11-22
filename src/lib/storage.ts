/**
 * Small values kept on this device, such as preferences and the destination.
 *
 * Storage can be blocked, full or hold rubbish. Nothing here ever throws: a value
 * that can't be read or trusted counts as missing.
 */

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StoredValue<T> {
  read(): T | null;
  /** Returns false when the value could not be kept. */
  write(value: T): boolean;
  clear(): void;
}

const PREFIX = "jec-maps:";

/** Raise `version` whenever the meaning of the value changes: old values are then dropped. */
export function storedValue<T>(
  name: string,
  version: number,
  isValid: (value: unknown) => value is T,
  getStore: () => KeyValueStore | null = browserStore,
): StoredValue<T> {
  const key = PREFIX + name;

  return {
    read() {
      try {
        const text = getStore()?.getItem(key);
        if (!text) return null;
        const stored: unknown = JSON.parse(text);
        if (typeof stored !== "object" || stored === null) return null;
        const { v, value } = stored as { v?: unknown; value?: unknown };
        return v === version && isValid(value) ? value : null;
      } catch {
        return null;
      }
    },

    write(value) {
      try {
        const store = getStore();
        if (!store) return false;
        store.setItem(key, JSON.stringify({ v: version, value }));
        return true;
      } catch {
        return false;
      }
    },

    clear() {
      try {
        getStore()?.removeItem(key);
      } catch {
        // Blocked storage: there is nothing to clear.
      }
    },
  };
}

function browserStore(): KeyValueStore | null {
  // Even reading `window.localStorage` can throw when the browser blocks it.
  return typeof window === "undefined" ? null : window.localStorage;
}

export const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
