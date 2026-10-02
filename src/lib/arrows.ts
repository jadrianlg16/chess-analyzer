import type { Square } from "chess.js";
import type { AnalysisLine } from "./analysis";
import type { ActiveVariation } from "./variation";

export type BoardArrow = {
  from: Square;
  to: Square;
  tone: "best" | "line";
};

function arrowFor(uci: string | undefined, tone: BoardArrow["tone"]): BoardArrow | null {
  if (!uci || uci.length < 4) return null;
  return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, tone };
}

/**
 * Arrows to draw on the board: while a line is previewed, its latest move;
 * otherwise, when switched on, the first move of each engine line (the top
 * line as "best").
 */
export function boardArrows(
  variation: ActiveVariation | null,
  lines: AnalysisLine[],
  showLines: boolean
): BoardArrow[] {
  if (variation) {
    const index = Math.max(0, Math.min(variation.ply - 1, variation.uciMoves.length - 1));
    const arrow = arrowFor(variation.uciMoves[index], "best");
    return arrow ? [arrow] : [];
  }
  if (!showLines) return [];
  return lines
    .map((line, index) => arrowFor(line.uciMoves[0], index === 0 ? "best" : "line"))
    .filter((arrow): arrow is BoardArrow => arrow !== null);
}
