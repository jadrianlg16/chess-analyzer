import { createEngineWorker } from "./analysis";
import { UciEngine, type WorkerLike } from "./engine";
import type { PositionEval } from "./review";

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

export type EvaluateOptions = {
  onProgress?: (done: number, total: number) => void;
  isCancelled?: () => boolean;
  createWorker?: () => WorkerLike;
};

/**
 * Evaluate positions one after another on a dedicated engine (so the live
 * analysis engine is never disturbed), keeping the best move for each.
 */
export async function evaluatePositions(
  fens: string[],
  nodes: number,
  options: EvaluateOptions = {}
): Promise<{ evals: Map<string, PositionEval>; cancelled: boolean }> {
  const engine = new UciEngine({ createWorker: options.createWorker ?? createEngineWorker });
  const evals = new Map<string, PositionEval>();
  let cancelled = false;

  try {
    for (let index = 0; index < fens.length; index += 1) {
      if (options.isCancelled?.()) {
        cancelled = true;
        break;
      }
      const result = await engine.search({ fen: fens[index], multipv: 1, limits: { nodes } });
      const top = result.lines[0];
      if (top) {
        evals.set(fens[index], {
          score: top.score,
          depth: top.depth,
          ...(result.bestMove ? { bestMove: result.bestMove } : {})
        });
      }
      options.onProgress?.(index + 1, fens.length);
    }
  } finally {
    engine.dispose();
  }

  return { evals, cancelled };
}
