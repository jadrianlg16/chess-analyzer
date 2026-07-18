import { describe, expect, it } from "vitest";

import { evaluationFromLine, scoreLabelForFen } from "../src/lib/evaluation";
import { engineOutputCases } from "./fixtures/engineOutputCases";
import { invalidFenCases, validFenCases } from "./fixtures/fenCases";

const expectUniqueNames = (names: string[]) => {
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  expect(duplicates).toEqual([]);
};

describe("Phase 1 verification fixtures", () => {
  it("keeps FEN fixtures named, tagged, and unique", () => {
    const allFenCases = [...validFenCases, ...invalidFenCases];

    expect(validFenCases.length).toBeGreaterThanOrEqual(5);
    expect(invalidFenCases.length).toBeGreaterThanOrEqual(10);
    expect(allFenCases.every((testCase) => testCase.name.length > 0)).toBe(true);
    expect(allFenCases.every((testCase) => testCase.tags.length > 0)).toBe(true);
    expectUniqueNames(allFenCases.map((testCase) => testCase.name));
  });

  it("covers the required engine parser shapes", () => {
    const tags = new Set(engineOutputCases.flatMap((testCase) => testCase.tags));

    expect(engineOutputCases.length).toBeGreaterThanOrEqual(6);
    expect([...tags]).toEqual(
      expect.arrayContaining(["info", "cp", "mate", "multipv", "bestmove", "noise"]),
    );
    expectUniqueNames(engineOutputCases.map((testCase) => testCase.name));
  });
});

describe("FEN validation", () => {
  it.todo("accepts every validFenCases entry through the app FEN validator");
  it.todo("rejects every invalidFenCases entry with a field-specific error");
  it.todo("normalizes accepted FEN only when normalization does not change board semantics");
});

describe("Setup mode", () => {
  it.todo("imports a valid FEN and renders matching pieces, metadata, and counters");
  it.todo("blocks apply for invalid FEN and preserves the previous valid board state");
  it.todo("updates exported FEN after piece edits, side toggles, and castling edits");
  it.todo("clears or flags impossible castling rights after king or rook edits");
});

describe("Engine output parsing", () => {
  it.todo("parses engineOutputCases into the expected info and bestmove records");
  it.todo("keeps multipv entries addressable by multipv index");
  it.todo("ignores engine chatter while retaining recoverable parse warnings");
});

describe("Evaluation display", () => {
  const blackToMoveAfterE4 =
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

  it("converts engine scores to White's perspective for labels", () => {
    expect(scoreLabelForFen({ kind: "cp", value: -31 }, blackToMoveAfterE4)).toBe("+0.31");
    expect(scoreLabelForFen({ kind: "mate", value: 3 }, blackToMoveAfterE4)).toBe("-M3");
  });

  it("maps White perspective scores to the eval bar leader and fill", () => {
    const display = evaluationFromLine(blackToMoveAfterE4, {
      multipv: 1,
      depth: 12,
      score: { kind: "cp", value: -160 },
      uciMoves: ["c7c5"],
      sanMoves: ["c5"]
    });

    expect(display.leader).toBe("white");
    expect(display.caption).toBe("White");
    expect(display.label).toBe("+1.60");
    expect(display.whiteShare).toBeGreaterThan(50);
  });
});

describe("Browser smoke", () => {
  it.todo("loads the Vite app without console errors");
  it.todo("shows a 64-square board and accepts a standard start-position FEN");
  it.todo("opens setup mode, edits a position, applies it, and renders parsed engine output");
});
