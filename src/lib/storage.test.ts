import { describe, expect, it } from "vitest";

import { isBoolean, storedValue, type KeyValueStore } from "./storage";

function memoryStore(): KeyValueStore & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

const brokenStore: KeyValueStore = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("full");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("storedValue", () => {
  it("keeps a value", () => {
    const store = memoryStore();
    const consent = storedValue("consent", 1, isBoolean, () => store);

    expect(consent.read()).toBeNull();
    expect(consent.write(true)).toBe(true);
    expect(consent.read()).toBe(true);
    consent.clear();
    expect(consent.read()).toBeNull();
  });

  it("drops values of another version", () => {
    const store = memoryStore();
    storedValue("consent", 1, isBoolean, () => store).write(true);

    expect(storedValue("consent", 2, isBoolean, () => store).read()).toBeNull();
  });

  it.each(["", "not json", "null", "[]", "42", '{"v":1}', '{"v":1,"value":"yes"}', '{"value":true}'])(
    "treats %j as missing",
    (text) => {
      const store = memoryStore();
      store.items.set("jec-maps:consent", text);

      expect(storedValue("consent", 1, isBoolean, () => store).read()).toBeNull();
    },
  );

  it("survives blocked or full storage", () => {
    const consent = storedValue("consent", 1, isBoolean, () => brokenStore);

    expect(consent.read()).toBeNull();
    expect(consent.write(true)).toBe(false);
    expect(() => consent.clear()).not.toThrow();
  });

  it("survives storage that throws when it is merely looked up", () => {
    const consent = storedValue("consent", 1, isBoolean, () => {
      throw new Error("SecurityError");
    });

    expect(consent.read()).toBeNull();
    expect(consent.write(true)).toBe(false);
  });

  it("survives the server, where there is no storage", () => {
    const consent = storedValue("consent", 1, isBoolean, () => null);

    expect(consent.read()).toBeNull();
    expect(consent.write(true)).toBe(false);
  });
});
