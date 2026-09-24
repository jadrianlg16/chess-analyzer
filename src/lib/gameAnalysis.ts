import { createEngineWorker } from "./analysis";
import { UciEngine, type SearchLimits, type WorkerLike } from "./engine";
import { buildReview, isError, type GameReview, type PositionEval, type ReviewedMove } from "./review";

export type ReviewPreset = "quick" | "standard" | "deep";

/**
 * Review budgets are node counts rather than depths: a fixed depth can take
 * 30x longer in sharp positions, while a node budget bounds the work per
 * position and gives the same result on every run of the single-threaded
 * engine. Rough cost at ~1.3M nodes/s: 60k ≈ 0.05 s, 250k ≈ 0.2 s,
 * 1M ≈ 0.8 s per position (slower on phones).
 */
export const REVIEW_PRESETS: Record<ReviewPreset, { label: string; nodes: number }> = {
  quick: { label: "Quick", nodes: 60_000 },
  standard: { label: "Standard", nodes: 250_000 },
  deep: { label: "Deep", nodes: 1_000_000 }
};

export type ReviewOptions = {
  onProgress?: (done: number, total: number) => void;
  isCancelled?: () => boolean;
  createWorker?: () => WorkerLike;
};

export type ReviewResult = {
  review: GameReview;
  evals: Map<string, PositionEval>;
  cancelled: boolean;
  /** Positions in the game (the review may have evaluated fewer if cancelled). */
  positions: number;
};

/**
 * Review a game on a dedicated engine (so live analysis is never disturbed):
 * 1. evaluate every position, keeping its best move;
 * 2. give each move graded as an error a second look by searching only the
 *    played move from the position before it, then grade again.
 */
export async function reviewGame(
  moves: ReviewedMove[],
  rootFen: string,
  nodes: number,
  options: ReviewOptions = {}
): Promise<ReviewResult> {
  const engine = new UciEngine({ createWorker: options.createWorker ?? createEngineWorker });
  const fens = Array.from(new Set([rootFen, ...moves.map((move) => move.fen)]));
  const evals = new Map<string, PositionEval>();
  const played = new Map<string, PositionEval>();
  let total = fens.length;
  let done = 0;
  let cancelled = false;

  const evaluate = async (fen: string, limits: SearchLimits): Promise<PositionEval | null> => {
    const result = await engine.search({ fen, multipv: 1, limits });
    done += 1;
    options.onProgress?.(done, total);
    const top = result.lines[0];
    if (!top) return null;
    return { score: top.score, depth: top.depth, ...(result.bestMove ? { bestMove: result.bestMove } : {}) };
  };

  try {
    for (const fen of fens) {
      if (options.isCancelled?.()) {
        cancelled = true;
        break;
      }
      const evaluation = await evaluate(fen, { nodes });
      if (evaluation) evals.set(fen, evaluation);
    }

    const flagged = cancelled
      ? []
      : moves.filter((move) => {
          const graded = buildReview([move], evals).moves[move.id];
          return graded && isError(graded.judgement);
        });
    total += flagged.length;

    for (const move of flagged) {
      if (options.isCancelled?.()) {
        cancelled = true;
        break;
      }
      const evaluation = await evaluate(move.parentFen, { nodes, searchMoves: [move.uci] });
      if (evaluation) played.set(move.id, evaluation);
    }
  } finally {
    engine.dispose();
  }

  return { review: buildReview(moves, evals, played), evals, cancelled, positions: fens.length };
}
