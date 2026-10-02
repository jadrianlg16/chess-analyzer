import { describe, expect, it } from "vitest";
import { buildFen, parseFen, uciLineToSan, validatePositionFen } from "../src/lib/position";
import { invalidFenCases, validFenCases } from "./fixtures/fenCases";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("validatePositionFen", () => {
  it.each(validFenCases)("accepts $name", ({ fen }) => {
    expect(validatePositionFen(fen)).toEqual({ ok: true });
  });

  it.each(invalidFenCases)("rejects $name", ({ fen, error }) => {
    const result = validatePositionFen(fen);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(error);
  });
});

describe("parseFen and buildFen", () => {
  // The setup panel edits the parsed position and writes it back with buildFen,
  // so every accepted FEN must survive the round trip unchanged.
  it.each(validFenCases)("round-trips $name", ({ fen }) => {
    expect(buildFen(parseFen(fen))).toBe(fen);
  });

  it("reads pieces and every metadata field", () => {
    const position = parseFen("r3k2r/8/8/8/8/8/8/R3K2R b Kq - 3 17");
    expect(position.board.a8).toEqual({ color: "b", type: "r" });
    expect(position.board.e1).toEqual({ color: "w", type: "k" });
    expect(Object.keys(position.board)).toHaveLength(6);
    expect(position.meta).toEqual({
      turn: "b",
      castling: { K: true, Q: false, k: false, q: true },
      enPassant: "-",
      halfmove: 3,
      fullmove: 17
    });
  });

  it("writes setup edits back: pieces, side to move and castling rights", () => {
    const position = parseFen(START);
    delete position.board.g1;
    position.board.f3 = { color: "w", type: "n" };
    position.meta = { ...position.meta, turn: "b", castling: { K: true, Q: true, k: false, q: false } };
    expect(buildFen(position)).toBe("rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQ - 0 1");
  });

  it("drops an en passant square that is not on rank 3 or 6 and clamps the counters", () => {
    const position = parseFen(START);
    position.meta = { ...position.meta, enPassant: "e4", halfmove: -2, fullmove: 0 };
    expect(buildFen(position)).toBe(START);
  });
});

describe("uciLineToSan", () => {
  it("converts a line and stops at the first illegal move", () => {
    expect(uciLineToSan(START, ["e2e4", "e7e5", "g1f3"])).toEqual(["e4", "e5", "Nf3"]);
    expect(uciLineToSan(START, ["e2e4", "e2e4", "g1f3"])).toEqual(["e4"]);
  });

  it("promotes to the piece named in the move, and to a queen by default", () => {
    const fen = "8/P6k/8/8/8/8/7K/8 w - - 0 1";
    expect(uciLineToSan(fen, ["a7a8n"])).toEqual(["a8=N"]);
    expect(uciLineToSan(fen, ["a7a8"])).toEqual(["a8=Q"]);
  });
});
