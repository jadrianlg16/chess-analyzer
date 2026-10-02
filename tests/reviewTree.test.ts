import { describe, expect, it } from "vitest";
import type { AnalysisUpdate } from "../src/lib/analysis";
import { reviewGame } from "../src/lib/gameAnalysis";
import { mainlineNodes, stepBackward, treeFromPgn } from "../src/lib/gameTree";
import type { PositionEval } from "../src/lib/review";
import { applyReviewNags, gradeExploredMove, mainlineReviewMoves, reviewGraphPoints } from "../src/lib/reviewTree";
import { fakeFactory } from "./fakeStockfish";

const ready = (fen: string, cp: number, bestMove: string): AnalysisUpdate => ({
  status: "ready",
  fen,
  bestMove,
  lines: [{ multipv: 1, depth: 14, score: { kind: "cp", value: cp }, uciMoves: [bestMove], sanMoves: [] }]
});

describe("game review applied to the move tree", () => {
  it("reviews the main line with the engine, marks the blunder and builds the graph", async () => {
    const tree = treeFromPgn("1. Nf3 e5 *");
    const [nf3, e5] = mainlineNodes(tree);
    // Before Nf3 White is +0.30; after it Black is +2.00, and a second look agrees.
    const fake = fakeFactory(() => ({
      scoreFor: (fen) => (fen === tree.rootFen ? 30 : fen === nf3.fen ? 200 : -200),
      scoreForMove: () => -180
    }));

    const moves = mainlineReviewMoves(tree);
    expect(moves.map((move) => move.parentFen)).toEqual([tree.rootFen, nf3.fen]);
    const { review, evals } = await reviewGame(moves, tree.rootFen, 1000, { createWorker: fake.create });

    const marked = applyReviewNags(tree, review);
    expect(marked.nodes[nf3.id].nag).toBe(4); // ??
    expect(marked.nodes[e5.id].nag).toBeUndefined();

    const points = reviewGraphPoints(marked, review, evals);
    expect(points.map((point) => point.label)).toEqual(["Start", "1. Nf3", "1… e5"]);
    expect(points[1]).toMatchObject({ id: nf3.id, judgement: "blunder" });
    expect(points[0].whiteWin).toBeGreaterThan(50);
    expect(points[1].whiteWin).toBeLessThan(50);
  });
});

describe("gradeExploredMove", () => {
  const tree = treeFromPgn("1. e4 f6 *");
  const [e4, f6] = mainlineNodes(tree);

  it("caches the settled eval and grades the move against its parent", () => {
    const cache = new Map<string, PositionEval>([
      [e4.fen, { score: { kind: "cp", value: -30 }, depth: 14, bestMove: "e7e5" }]
    ]);
    // After 1...f6 White (to move) is +1.80: Black lost about 0.26 in winning chances.
    const change = gradeExploredMove({
      analysis: ready(f6.fen, 180, "d2d4"),
      fen: f6.fen,
      tree,
      reviewedMoves: undefined,
      cache
    });

    expect(cache.get(f6.fen)?.score).toEqual({ kind: "cp", value: 180 });
    expect(change).toEqual({ nodeId: f6.id, nag: 2 }); // ?
  });

  it("does nothing until the parent position has been evaluated", () => {
    const cache = new Map<string, PositionEval>();
    expect(
      gradeExploredMove({ analysis: ready(f6.fen, 120, "d2d4"), fen: f6.fen, tree, reviewedMoves: undefined, cache })
    ).toBeNull();
    expect(cache.has(f6.fen)).toBe(true);
  });

  it("ignores analysis of another position or one still running", () => {
    const cache = new Map<string, PositionEval>([[e4.fen, { score: { kind: "cp", value: -30 }, depth: 14 }]]);
    const onE4 = stepBackward(tree);
    expect(
      gradeExploredMove({
        analysis: ready(f6.fen, 120, "d2d4"),
        fen: e4.fen,
        tree: onE4,
        reviewedMoves: undefined,
        cache
      })
    ).toBeNull();
    const running: AnalysisUpdate = { ...ready(f6.fen, 120, "d2d4"), status: "analyzing" };
    expect(gradeExploredMove({ analysis: running, fen: f6.fen, tree, reviewedMoves: undefined, cache })).toBeNull();
  });

  it("leaves moves graded by a game review alone", () => {
    const cache = new Map<string, PositionEval>([[e4.fen, { score: { kind: "cp", value: -30 }, depth: 14 }]]);
    const reviewed = {
      [f6.id]: {
        nodeId: f6.id,
        color: "b" as const,
        judgement: "good" as const,
        winBefore: 50,
        winAfter: 45,
        accuracy: 90
      }
    };
    expect(
      gradeExploredMove({ analysis: ready(f6.fen, 120, "d2d4"), fen: f6.fen, tree, reviewedMoves: reviewed, cache })
    ).toBeNull();
  });
});
