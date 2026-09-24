import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { evaluationFromLine, scoreLabelForFen } from "../src/lib/evaluation";
import { validatePositionFen } from "../src/lib/position";
import {
  buildReview,
  judgeMove,
  moveAccuracy,
  povValue,
  winningChances,
  type PositionEval
} from "../src/lib/review";

const cp = (value: number, bestMove?: string): PositionEval => ({
  score: { kind: "cp", value },
  depth: 14,
  ...(bestMove ? { bestMove } : {})
});
const mate = (value: number, bestMove?: string): PositionEval => ({
  score: { kind: "mate", value },
  depth: 14,
  ...(bestMove ? { bestMove } : {})
});

describe("winning chances", () => {
  it("is symmetric, zero at equality, and capped at ten pawns", () => {
    expect(winningChances(0)).toBe(0);
    expect(winningChances(300)).toBeCloseTo(-winningChances(-300), 10);
    expect(winningChances(5000)).toBe(winningChances(1000));
  });

  it("scores mates from either side, including mate 0 (already checkmated)", () => {
    expect(povValue({ kind: "mate", value: 3 }, "w", "w")).toBeGreaterThan(povValue({ kind: "mate", value: 5 }, "w", "w"));
    expect(povValue({ kind: "mate", value: 0 }, "b", "w")).toBeGreaterThan(90_000);
    expect(povValue({ kind: "mate", value: 0 }, "b", "b")).toBeLessThan(-90_000);
    expect(povValue({ kind: "cp", value: 40 }, "b", "w")).toBe(-40);
  });
});

describe("judgeMove", () => {
  // Measured on the Opera Game, move 15 (Stockfish 18 lite, depth 14):
  // before 15.Bxd7+ White is +6.21 with Bxd7+ as the top move, but the
  // separate search after it says only +1.98 (it misses 16.Qb8+!!).
  const beforeBxd7 = cp(621, "b5d7");
  const afterBxd7 = cp(-198); // Black to move

  it("never flags the engine's own best move", () => {
    const verdict = judgeMove({ mover: "w", before: beforeBxd7, after: afterBxd7, playedUci: "b5d7" });
    expect(verdict.judgement).toBe("best");
    expect(verdict.accuracy).toBe(100);
  });

  it("would have called that same move a blunder without the best-move rule", () => {
    const verdict = judgeMove({ mover: "w", before: beforeBxd7, after: afterBxd7, playedUci: "g5f6" });
    expect(verdict.judgement).toBe("blunder");
  });

  it("uses a second look at the played move when it rates the move higher", () => {
    // Quick preset on the same position preferred Bxf6, so the best-move rule
    // can't help; searching only Bxd7+ from the position before it can.
    const before = cp(580, "g5f6");
    const secondLook = cp(640, "b5d7");
    expect(judgeMove({ mover: "w", before, after: afterBxd7, playedUci: "b5d7" }).judgement).toBe("blunder");
    expect(judgeMove({ mover: "w", before, after: afterBxd7, playedUci: "b5d7", played: secondLook }).judgement).toBe("good");
    // A second look never makes a move look worse than the search after it.
    expect(
      judgeMove({ mover: "w", before, after: cp(-560), playedUci: "b5d7", played: cp(100) }).judgement
    ).toBe("good");
  });

  it("does not punish a winning position that stays winning", () => {
    // +10 -> +7.5 was a "blunder" under the old 250 cp rule.
    const verdict = judgeMove({ mover: "w", before: cp(1000, "d1d8"), after: cp(-750), playedUci: "a2a3" });
    expect(verdict.judgement).toBe("good");
  });

  it("grades by the drop in winning chances", () => {
    expect(judgeMove({ mover: "w", before: cp(30, "e2e4"), after: cp(-10), playedUci: "a2a3" }).judgement).toBe("good");
    // +0.30 -> -0.50 drops winning chances by 0.15; -> -1.00 by 0.24.
    expect(judgeMove({ mover: "w", before: cp(30, "e2e4"), after: cp(50), playedUci: "a2a3" }).judgement).toBe("inaccuracy");
    expect(judgeMove({ mover: "w", before: cp(30, "e2e4"), after: cp(100), playedUci: "a2a3" }).judgement).toBe("mistake");
    expect(judgeMove({ mover: "b", before: cp(0, "e7e5"), after: cp(400), playedUci: "f7f6" }).judgement).toBe("blunder");
  });

  it("flags allowing a forced mate and missing one", () => {
    const allowed = judgeMove({ mover: "w", before: cp(50, "e1g1"), after: mate(2), playedUci: "f2f3" });
    expect(allowed).toMatchObject({ judgement: "blunder", reason: "allowed-mate" });

    const missed = judgeMove({ mover: "w", before: mate(3, "d1d8"), after: cp(-300), playedUci: "a2a3" });
    expect(missed).toMatchObject({ judgement: "blunder", reason: "missed-mate" });

    const stillCrushing = judgeMove({ mover: "w", before: mate(3, "d1d8"), after: cp(-1200), playedUci: "a2a3" });
    expect(stillCrushing).toMatchObject({ judgement: "inaccuracy", reason: "missed-mate" });
  });

  it("treats delivering checkmate as winning, not as a mistake", () => {
    const verdict = judgeMove({ mover: "w", before: mate(2, "b3b8"), after: mate(0), playedUci: "d1d8" });
    expect(verdict.judgement).toBe("good");
    expect(verdict.winAfter).toBe(100);
  });
});

describe("moveAccuracy", () => {
  it("is 100 for no loss and falls with the win % drop", () => {
    expect(moveAccuracy(60, 60)).toBeCloseTo(100, 3);
    expect(moveAccuracy(60, 50)).toBeCloseTo(63.6, 1);
    expect(moveAccuracy(90, 10)).toBeCloseTo(0, 1);
  });
});

describe("buildReview", () => {
  it("grades each move, names the best alternative, and summarizes per side", () => {
    const game = new Chess();
    const start = game.fen();
    game.move("f3");
    const afterF3 = game.fen();
    game.move("e5");
    const afterE5 = game.fen();

    const evals = new Map<string, PositionEval>([
      [start, cp(30, "e2e4")],
      [afterF3, cp(10, "e7e5")], // Black to move: White is -0.10
      [afterE5, cp(-20, "e2e4")]
    ]);
    const review = buildReview(
      [
        { id: "m1", color: "w", uci: "f2f3", fen: afterF3, parentFen: start },
        { id: "m2", color: "b", uci: "e7e5", fen: afterE5, parentFen: afterF3 }
      ],
      evals
    );

    expect(review.moves.m1).toMatchObject({ judgement: "good", bestSan: "e4" });
    expect(review.moves.m2).toMatchObject({ judgement: "best", accuracy: 100 });
    expect(review.white.moves).toBe(1);
    expect(review.black.accuracy).toBe(100);
  });
});

describe("terminal positions and illegal setups", () => {
  const checkmated = "1n1Rkb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2K5 b k - 1 17";

  it("shows checkmate on the eval bar instead of 'No eval'", () => {
    const line = { multipv: 1, depth: 0, score: { kind: "mate" as const, value: 0 }, uciMoves: [], sanMoves: [] };
    expect(evaluationFromLine(checkmated, line)).toMatchObject({ leader: "white", label: "#", whiteShare: 100 });
    expect(scoreLabelForFen(line.score, checkmated)).toBe("#");
  });

  it("rejects a setup where the side not to move is in check", () => {
    const result = validatePositionFen("4k3/8/8/8/8/8/8/K3R3 w - - 0 1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Black is in check/);
    expect(validatePositionFen("4k3/8/8/8/8/8/8/K3R3 b - - 0 1").ok).toBe(true);
  });
});
