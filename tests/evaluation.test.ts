import { describe, expect, it } from "vitest";
import { evaluationFromLine, scoreLabelForFen } from "../src/lib/evaluation";

const BLACK_TO_MOVE_AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
// Opera Game final position: Black is checkmated.
const CHECKMATED = "1n1Rkb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2K5 b k - 1 17";

describe("scoreLabelForFen", () => {
  it("converts engine scores to White's perspective", () => {
    expect(scoreLabelForFen({ kind: "cp", value: -31 }, BLACK_TO_MOVE_AFTER_E4)).toBe("+0.31");
    expect(scoreLabelForFen({ kind: "mate", value: 3 }, BLACK_TO_MOVE_AFTER_E4)).toBe("-M3");
  });

  it("labels a finished game with #", () => {
    expect(scoreLabelForFen({ kind: "mate", value: 0 }, CHECKMATED)).toBe("#");
  });
});

describe("evaluationFromLine", () => {
  it("maps White-perspective scores to the eval bar leader and fill", () => {
    const display = evaluationFromLine(BLACK_TO_MOVE_AFTER_E4, {
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

  it("calls small scores equal and keeps the bar off the ends", () => {
    const line = (value: number) => ({
      multipv: 1,
      depth: 12,
      score: { kind: "cp" as const, value },
      uciMoves: [],
      sanMoves: []
    });
    expect(evaluationFromLine(BLACK_TO_MOVE_AFTER_E4, line(15))).toMatchObject({
      leader: "equal",
      placement: "middle"
    });
    expect(evaluationFromLine(BLACK_TO_MOVE_AFTER_E4, line(5000)).whiteShare).toBe(4);
    expect(evaluationFromLine(BLACK_TO_MOVE_AFTER_E4, line(-5000)).whiteShare).toBe(96);
  });

  it("shows checkmate on the eval bar instead of 'No eval'", () => {
    const line = { multipv: 1, depth: 0, score: { kind: "mate" as const, value: 0 }, uciMoves: [], sanMoves: [] };
    expect(evaluationFromLine(CHECKMATED, line)).toMatchObject({ leader: "white", label: "#", whiteShare: 100 });
  });

  it("has a neutral state before the engine reports", () => {
    expect(evaluationFromLine(BLACK_TO_MOVE_AFTER_E4)).toMatchObject({
      leader: "unknown",
      label: "--",
      whiteShare: 50
    });
  });
});
