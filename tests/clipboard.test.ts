import { describe, expect, it } from "vitest";
import { copyToClipboard } from "../src/lib/clipboard";

describe("copyToClipboard", () => {
  it("writes the text and reports success", async () => {
    const written: string[] = [];
    const ok = await copyToClipboard("1. e4 *", { writeText: async (text) => void written.push(text) });
    expect(ok).toBe(true);
    expect(written).toEqual(["1. e4 *"]);
  });

  it("reports failure when the browser refuses the write", async () => {
    const refused = { writeText: () => Promise.reject(new DOMException("Write permission denied.", "NotAllowedError")) };
    await expect(copyToClipboard("1. e4 *", refused)).resolves.toBe(false);
  });

  it("reports failure when there is no Clipboard API", async () => {
    await expect(copyToClipboard("1. e4 *", undefined)).resolves.toBe(false);
  });
});
