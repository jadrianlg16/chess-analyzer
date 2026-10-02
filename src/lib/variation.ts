import { Chess, type Square } from "chess.js";
import { moveFromUci, parseFen, type PositionState } from "./position";

/** An engine line being stepped through on the board, without touching the game. */
export type ActiveVariation = {
  sourceFen: string;
  multipv: number;
  uciMoves: string[];
  /** How many of the line's moves are played on the board (0 = the source position). */
  ply: number;
};

export type VariationPreview = {
  position: PositionState;
  fen: string;
  lastMove: { from: Square; to: Square } | null;
  playedSans: string[];
};

/** The board after the first `ply` moves of the line, or null if the line can't be replayed. */
export function previewVariation(variation: ActiveVariation): VariationPreview | null {
  try {
    const preview = new Chess(variation.sourceFen);
    const playedSans: string[] = [];
    let lastMove: VariationPreview["lastMove"] = null;
    for (let index = 0; index < variation.ply; index += 1) {
      const uciMove = variation.uciMoves[index];
      if (!uciMove) break;
      const made = moveFromUci(preview, uciMove);
      playedSans.push(made.san);
      lastMove = { from: made.from, to: made.to };
    }
    return { position: parseFen(preview.fen()), fen: preview.fen(), lastMove, playedSans };
  } catch {
    return null;
  }
}
