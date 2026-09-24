import { describe, expect, it } from "vitest";
import { StockfishClient, type AnalysisUpdate } from "../src/lib/analysis";
import { fakeFactory, waitFor } from "./fakeStockfish";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MIDDLEGAME = "r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P4/2PBPN2/PP1N1PPP/R1BQ1RK1 w - - 0 8";

describe("StockfishClient", () => {
  it("re-analyzing mid-search reports only the new position", async () => {
    const fake = fakeFactory(() => ({ scoreFor: (fen) => (fen === START ? 31 : 77) }));
    const updates: AnalysisUpdate[] = [];
    const client = new StockfishClient((update) => updates.push(update), { createWorker: fake.create });

    client.analyze(START, { depth: 30, multipv: 3 });
    await waitFor(() => updates.some((update) => update.status === "analyzing"));
    const switchedAt = updates.length;
    client.analyze(MIDDLEGAME, { depth: 12, multipv: 3 });
    await waitFor(() => updates.at(-1)?.status === "ready");

    const after = updates.slice(switchedAt);
    expect(after.every((update) => update.fen === MIDDLEGAME)).toBe(true);
    expect(after.flatMap((update) => update.lines).every((line) => line.score.value >= 75)).toBe(true);
    expect(updates.at(-1)?.bestMove).toBeTruthy();
    expect(fake.workers[0].violations).toEqual([]);
    client.dispose();
  });

  it("recovers from a crash and says so", async () => {
    const fake = fakeFactory((index) => ({ crashOnGo: index === 0 }));
    const updates: AnalysisUpdate[] = [];
    const client = new StockfishClient((update) => updates.push(update), { createWorker: fake.create });

    client.analyze(MIDDLEGAME, { depth: 12, multipv: 1 });
    await waitFor(() => updates.at(-1)?.status === "ready");

    expect(updates.at(-1)?.lines.length).toBe(1);
    expect(updates.at(-1)?.message).toMatch(/restarted/);
    client.dispose();
  });

  it("reports an error, not fake analysis, when the engine keeps crashing", async () => {
    const fake = fakeFactory(() => ({ crashOnGo: true }));
    const updates: AnalysisUpdate[] = [];
    const client = new StockfishClient((update) => updates.push(update), { createWorker: fake.create });

    client.analyze(MIDDLEGAME, { depth: 12, multipv: 1 });
    await waitFor(() => updates.at(-1)?.status === "error");

    expect(updates.at(-1)?.lines).toEqual([]);
    expect(updates.at(-1)?.message).toMatch(/Press Analyze to try again/);
    client.dispose();
  });
});
