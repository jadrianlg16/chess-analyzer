import { afterEach, describe, expect, it, vi } from "vitest";
import { readSetting, writeSetting } from "../src/lib/storage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("settings storage", () => {
  it("reads and writes through localStorage", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value)
      }
    });

    writeSetting("chess-sound", "off");
    expect(readSetting("chess-sound")).toBe("off");
    expect(readSetting("chess-board-theme")).toBeNull();
  });

  it("falls back instead of throwing when the browser blocks storage", () => {
    // What Chrome does with "Block all cookies": the getter itself throws.
    const blocked = {};
    Object.defineProperty(blocked, "localStorage", {
      get() {
        throw new DOMException("Access is denied for this document.", "SecurityError");
      }
    });
    vi.stubGlobal("window", blocked);

    expect(readSetting("chess-sound")).toBeNull();
    expect(() => writeSetting("chess-sound", "off")).not.toThrow();
  });

  it("ignores a full storage quota", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        }
      }
    });

    expect(() => writeSetting("chess-board-theme", "walnut")).not.toThrow();
  });
});
