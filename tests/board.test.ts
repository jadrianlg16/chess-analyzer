import { describe, expect, it } from "vitest";
import type { AnalysisLine } from "../src/lib/analysis";
import { boardArrows } from "../src/lib/arrows";
import { checkBoardMove } from "../src/lib/boardMove";
import { gameStatusOf } from "../src/lib/gameStatus";
import { START_FEN } from "../src/lib/position";
import { previewVariation, type ActiveVariation } from "../src/lib/variation";

const line = (multipv: number, ...uciMoves: string[]): AnalysisLine => ({
  multipv,
  depth: 14,
  score: { kind: "cp", value: 30 },
  uciMoves,
  sanMoves: []
});

describe("checkBoardMove", () => {
  const promotion = "8/P6k/8/8/8/8/7K/8 w - - 0 1";

  it("accepts a legal move and reports its SAN and flags", () => {
    expect(checkBoardMove(START_FEN, "e2", "e4")).toEqual({ kind: "legal", san: "e4", flags: "b" });
  });

  it("rejects illegal moves and moving the wrong side", () => {
    expect(checkBoardMove(START_FEN, "e2", "e5")).toEqual({ kind: "illegal" });
    expect(checkBoardMove(START_FEN, "e7", "e5")).toEqual({ kind: "illegal" });
    expect(checkBoardMove(START_FEN, "e4", "e5")).toEqual({ kind: "illegal" });
  });

  it("asks for a promotion piece, then plays the chosen one", () => {
    expect(checkBoardMove(promotion, "a7", "a8")).toEqual({ kind: "needs-promotion", color: "w" });
    expect(checkBoardMove(promotion, "a7", "a8", "n")).toMatchObject({ kind: "legal", san: "a8=N" });
  });

  it("does nothing for a position that can't be loaded", () => {
    expect(checkBoardMove("not a fen", "e2", "e4")).toEqual({ kind: "unavailable" });
  });
});

describe("gameStatusOf", () => {
  it("announces checkmate, stalemate, draws and check", () => {
    expect(gameStatusOf("1n1Rkb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2K5 b k - 1 17")).toEqual({ type: "checkmate", winner: "w" });
    expect(gameStatusOf("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")).toEqual({ type: "stalemate" });
    expect(gameStatusOf("8/8/4k3/8/8/4K3/8/8 w - - 0 1")).toEqual({ type: "draw", reason: "Insufficient material" });
    expect(gameStatusOf("4k3/8/8/8/8/8/8/R3K3 w - - 100 80")).toEqual({ type: "draw", reason: "Fifty-move rule" });
    expect(gameStatusOf("4k3/8/8/8/8/8/8/K3R3 b - - 0 1")).toEqual({ type: "check" });
    expect(gameStatusOf(START_FEN)).toBeNull();
  });
});

describe("previewVariation", () => {
  const variation: ActiveVariation = { sourceFen: START_FEN, multipv: 1, uciMoves: ["e2e4", "e7e5", "g1f3"], ply: 2 };

  it("plays the first `ply` moves of the line", () => {
    const preview = previewVariation(variation);
    expect(preview?.playedSans).toEqual(["e4", "e5"]);
    expect(preview?.lastMove).toEqual({ from: "e7", to: "e5" });
    expect(preview?.position.board.e5).toEqual({ color: "b", type: "p" });
  });

  it("shows the source position at ply 0 and gives up on a broken line", () => {
    expect(previewVariation({ ...variation, ply: 0 })).toMatchObject({ fen: START_FEN, lastMove: null, playedSans: [] });
    expect(previewVariation({ ...variation, uciMoves: ["e2e5"], ply: 1 })).toBeNull();
  });
});

describe("boardArrows", () => {
  const lines = [line(1, "e2e4", "e7e5"), line(2, "d2d4"), line(3, "")];

  it("draws each engine line's first move when switched on", () => {
    expect(boardArrows(null, lines, true)).toEqual([
      { from: "e2", to: "e4", tone: "best" },
      { from: "d2", to: "d4", tone: "line" }
    ]);
    expect(boardArrows(null, lines, false)).toEqual([]);
  });

  it("draws only the current move of a previewed line", () => {
    const variation: ActiveVariation = { sourceFen: START_FEN, multipv: 1, uciMoves: ["e2e4", "e7e5"], ply: 2 };
    expect(boardArrows(variation, lines, true)).toEqual([{ from: "e7", to: "e5", tone: "best" }]);
    expect(boardArrows({ ...variation, ply: 0 }, lines, false)).toEqual([{ from: "e2", to: "e4", tone: "best" }]);
  });
});
