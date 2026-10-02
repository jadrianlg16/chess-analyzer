import { Chess } from "chess.js";

export type GameStatus =
  | { type: "checkmate"; winner: "w" | "b" }
  | { type: "stalemate" }
  | { type: "draw"; reason: string }
  | { type: "check" };

/** What the board banner should announce for a position, or null when play simply goes on. */
export function gameStatusOf(fen: string): GameStatus | null {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return null;
  }
  if (chess.isCheckmate()) return { type: "checkmate", winner: chess.turn() === "w" ? "b" : "w" };
  if (chess.isStalemate()) return { type: "stalemate" };
  if (chess.isInsufficientMaterial()) return { type: "draw", reason: "Insufficient material" };
  if (chess.isThreefoldRepetition()) return { type: "draw", reason: "Threefold repetition" };
  if (chess.isDraw()) return { type: "draw", reason: "Fifty-move rule" };
  if (chess.isCheck()) return { type: "check" };
  return null;
}
