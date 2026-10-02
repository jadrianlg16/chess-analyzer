import { Chess, type Color, type Move, type Square } from "chess.js";

export type PromotionPiece = "q" | "r" | "b" | "n";

export type BoardMoveCheck =
  /** The position can't be played from (invalid FEN). */
  | { kind: "unavailable" }
  | { kind: "illegal" }
  /** A pawn reaches the last rank and no promotion piece was chosen yet. */
  | { kind: "needs-promotion"; color: Color }
  | { kind: "legal"; san: string; flags: string };

/** Check a move made on the board (click or drag) before it is added to the game. */
export function checkBoardMove(fen: string, from: Square, to: Square, promotion?: PromotionPiece): BoardMoveCheck {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return { kind: "unavailable" };
  }

  const moving = chess.get(from);
  if (!moving || moving.color !== chess.turn()) return { kind: "illegal" };

  const isLegal = (chess.moves({ square: from, verbose: true }) as Move[]).some((move) => move.to === to);
  if (!isLegal) return { kind: "illegal" };

  const lastRank = moving.color === "w" ? "8" : "1";
  if (moving.type === "p" && to[1] === lastRank && !promotion) {
    return { kind: "needs-promotion", color: moving.color };
  }

  try {
    const made = chess.move({ from, to, promotion: promotion ?? "q" });
    return { kind: "legal", san: made.san, flags: made.flags };
  } catch {
    return { kind: "illegal" };
  }
}
