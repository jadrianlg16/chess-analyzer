import { describe, expect, it } from "vitest";
import { EngineError, parseUciInfo, UciEngine, type UciInfo } from "../src/lib/engine";
import { fakeFactory, sleep, waitFor } from "./fakeStockfish";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const AFTER_D4 = "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1";
const MIDDLEGAME = "r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P4/2PBPN2/PP1N1PPP/R1BQ1RK1 w - - 0 8";
// Opera Game final position (Black is checkmated) and a plain stalemate.
const CHECKMATE = "1n1Rkb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2K5 b k - 1 17";
const STALEMATE = "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1";

const scores: Record<string, number> = { [START]: 31, [AFTER_E4]: -41, [AFTER_D4]: -52, [MIDDLEGAME]: 77 };
const scoreFor = (fen: string) => scores[fen] ?? 0;

describe("parseUciInfo", () => {
  it("reads depth, multipv, score and pv", () => {
    const info = parseUciInfo(
      "info depth 14 seldepth 20 multipv 2 score cp -35 nodes 90759 nps 1334691 hashfull 12 time 68 pv e7e5 g1f3"
    );
    expect(info).toMatchObject({ depth: 14, multipv: 2, score: { kind: "cp", value: -35 }, pv: ["e7e5", "g1f3"] });
  });

  it("reads mate scores and bounds", () => {
    expect(parseUciInfo("info depth 9 score mate -3 pv h7h8")?.score).toEqual({ kind: "mate", value: -3 });
    expect(parseUciInfo("info depth 9 score cp 40 lowerbound nodes 5 pv e2e4")?.bound).toBe("lower");
  });

  it("keeps terminal lines that have no pv", () => {
    expect(parseUciInfo("info depth 0 score mate 0")).toMatchObject({ depth: 0, score: { kind: "mate", value: 0 }, pv: [] });
    expect(parseUciInfo("info depth 0 score cp 0")).toMatchObject({ score: { kind: "cp", value: 0 }, pv: [] });
  });

  it("ignores engine chatter", () => {
    expect(parseUciInfo("info string NNUE evaluation using nn-9067e33176e8.nnue")).toBeNull();
    expect(parseUciInfo("info depth 20 currmove e2e4 currmovenumber 1")).toBeNull();
    expect(parseUciInfo("bestmove e2e4 ponder e7e5")).toBeNull();
  });
});

describe("UciEngine", () => {
  it("runs a search and reports progress and the best move", async () => {
    const fake = fakeFactory(() => ({ scoreFor }));
    const engine = new UciEngine({ createWorker: fake.create });
    const progress: UciInfo[][] = [];

    const result = await engine.search({ fen: START, multipv: 2, limits: { depth: 12 }, onInfo: (lines) => progress.push(lines) });

    expect(result.stopped).toBe(false);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].score).toEqual({ kind: "cp", value: 31 });
    expect(result.bestMove).toBe(result.lines[0].pv[0]);
    expect(progress.length).toBeGreaterThan(0);
    expect(fake.workers[0].received).toContain("go depth 12");
    engine.dispose();
  });

  it("waits for bestmove before sending the next search, so the engine never gets a mid-search burst", async () => {
    const fake = fakeFactory(() => ({ scoreFor, autoFinish: false }));
    const engine = new UciEngine({ createWorker: fake.create });

    const first = engine.search({ fen: START, multipv: 3, limits: {} });
    await waitFor(() => fake.workers[0]?.goCount === 1);
    await sleep(10); // let the first search report some lines
    const secondInfo: UciInfo[][] = [];
    const second = engine.search({ fen: AFTER_E4, multipv: 1, limits: {}, onInfo: (lines) => secondInfo.push(lines) });
    await waitFor(() => fake.workers[0].goCount === 2);
    engine.stop();

    const [a, b] = await Promise.all([first, second]);
    const worker = fake.workers[0];
    expect(worker.violations).toEqual([]);
    expect(worker.crashed).toBe(false);
    expect(a.stopped).toBe(true);
    expect(b.fen).toBe(AFTER_E4);
    // Nothing from the first search leaked into the second one.
    expect(secondInfo.flat().every((line) => line.score.value === -41)).toBe(true);
    engine.dispose();
  });

  it("skips superseded searches that never started", async () => {
    const fake = fakeFactory(() => ({ scoreFor }));
    const engine = new UciEngine({ createWorker: fake.create });

    const searches = [START, AFTER_E4, AFTER_D4, MIDDLEGAME].map((fen) => engine.search({ fen, limits: { depth: 5 } }));
    const results = await Promise.all(searches);

    expect(results.slice(0, 3).every((result) => result.stopped)).toBe(true);
    expect(results[3]).toMatchObject({ fen: MIDDLEGAME, stopped: false });
    expect(results[3].lines[0].score.value).toBe(77);
    expect(fake.workers[0].goCount).toBe(1);
    engine.dispose();
  });

  it("replaces a crashed worker and retries the search", async () => {
    const fake = fakeFactory((index) => ({ scoreFor, crashOnGo: index === 0 }));
    const engine = new UciEngine({ createWorker: fake.create });

    const result = await engine.search({ fen: MIDDLEGAME, limits: { depth: 10 } });

    expect(fake.workers).toHaveLength(2);
    expect(fake.workers[0].terminated).toBe(true);
    expect(result).toMatchObject({ stopped: false, restarts: 1 });
    expect(result.lines[0].score.value).toBe(77);

    // The next search reuses the healthy replacement.
    const next = await engine.search({ fen: START, limits: { depth: 10 } });
    expect(next.restarts).toBe(0);
    expect(fake.workers).toHaveLength(2);
    engine.dispose();
  });

  it("gives up after repeated crashes, and recovers on a later search", async () => {
    const fake = fakeFactory((index) => ({ scoreFor, crashOnGo: index < 3 }));
    const engine = new UciEngine({ createWorker: fake.create, maxRestarts: 2 });

    await expect(engine.search({ fen: START, limits: { depth: 10 } })).rejects.toBeInstanceOf(EngineError);
    expect(fake.workers).toHaveLength(3);

    const later = await engine.search({ fen: START, limits: { depth: 10 } });
    expect(later.stopped).toBe(false);
    engine.dispose();
  });

  it("answers checkmate and stalemate without the engine", async () => {
    const fake = fakeFactory();
    const engine = new UciEngine({ createWorker: fake.create });

    const mate = await engine.search({ fen: CHECKMATE, limits: { depth: 10 } });
    const stale = await engine.search({ fen: STALEMATE, limits: { depth: 10 } });

    expect(mate).toMatchObject({ terminal: "checkmate", lines: [{ score: { kind: "mate", value: 0 }, pv: [] }] });
    expect(stale).toMatchObject({ terminal: "stalemate", lines: [{ score: { kind: "cp", value: 0 } }] });
    expect(fake.workers).toHaveLength(0);
    engine.dispose();
  });

  it("stop() keeps the partial lines", async () => {
    const fake = fakeFactory(() => ({ scoreFor, autoFinish: false }));
    const engine = new UciEngine({ createWorker: fake.create });

    const search = engine.search({ fen: MIDDLEGAME, limits: {} });
    await waitFor(() => fake.workers[0]?.goCount === 1);
    await sleep(10);
    engine.stop();
    const result = await search;

    expect(result.stopped).toBe(true);
    expect(result.lines[0].score.value).toBe(77);
    engine.dispose();
  });

  it("replaces a worker that ignores stop", async () => {
    const fake = fakeFactory((index) => ({ scoreFor, autoFinish: false, ignoreStop: index === 0 }));
    const engine = new UciEngine({ createWorker: fake.create, stopTimeoutMs: 30 });

    const hung = engine.search({ fen: START, limits: {} });
    await waitFor(() => fake.workers[0]?.goCount === 1);
    const next = engine.search({ fen: MIDDLEGAME, limits: { depth: 5 } });
    await waitFor(() => fake.workers[1]?.goCount === 1);
    engine.stop();

    expect((await hung).stopped).toBe(true);
    expect(fake.workers[0].terminated).toBe(true);
    expect(fake.workers[0].goCount).toBe(1);
    expect((await next).fen).toBe(MIDDLEGAME);
    engine.dispose();
  });

  it("stop() cancels a search that is still waiting for the engine to load", async () => {
    const fake = fakeFactory(() => ({ scoreFor }));
    const engine = new UciEngine({ createWorker: fake.create });

    const search = engine.search({ fen: START, limits: { depth: 5 } });
    engine.stop();

    await expect(search).resolves.toMatchObject({ stopped: true, lines: [] });
    await sleep(20);
    expect(fake.workers.every((worker) => worker.goCount === 0)).toBe(true);
    engine.dispose();
  });

  it("resolves pending searches as stopped when disposed", async () => {
    const fake = fakeFactory(() => ({ scoreFor, autoFinish: false }));
    const engine = new UciEngine({ createWorker: fake.create });

    const search = engine.search({ fen: START, limits: {} });
    await waitFor(() => fake.workers[0]?.goCount === 1);
    engine.dispose();

    await expect(search).resolves.toMatchObject({ stopped: true });
    expect(fake.workers[0].terminated).toBe(true);
  });
});
