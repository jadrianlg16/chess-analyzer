import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from "react";
import type { ReviewView } from "../components/MovePanel";
import { REVIEW_PRESETS, reviewGame, type ReviewPreset } from "../lib/gameAnalysis";
import type { GameTree } from "../lib/gameTree";
import type { GameReview, PositionEval } from "../lib/review";
import { applyReviewNags, mainlineReviewMoves, reviewGraphPoints } from "../lib/reviewTree";

type GameReviewOptions = {
  tree: GameTree;
  setTree: Dispatch<SetStateAction<GameTree>>;
  /** Evaluations by FEN; the review adds every position it evaluates. */
  evalCache: MutableRefObject<Map<string, PositionEval>>;
  /** Called when a review starts. */
  onStart: () => void;
};

type ReviewState = {
  review: GameReview;
  evals: Map<string, PositionEval>;
  cancelled: boolean;
  total: number;
};

/**
 * Runs a game review of the main line on its own engine, marks the graded
 * moves with ?!, ? and ?? in the move tree, and builds the panel's summary
 * and winning-chances graph.
 */
export function useGameReview({ tree, setTree, evalCache, onStart }: GameReviewOptions) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ReviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<ReviewPreset>("standard");
  const cancelRef = useRef(false);

  async function start() {
    const moves = mainlineReviewMoves(tree);
    if (!moves.length || running) return;

    cancelRef.current = false;
    setRunning(true);
    onStart();
    setResult(null);
    setError(null);

    setProgress({ done: 0, total: moves.length + 1 });

    try {
      const { review, evals, cancelled, positions } = await reviewGame(
        moves,
        tree.rootFen,
        REVIEW_PRESETS[preset].nodes,
        {
          onProgress: (done, total) => setProgress({ done, total }),
          isCancelled: () => cancelRef.current
        }
      );

      for (const [positionFen, evaluation] of evals) evalCache.current.set(positionFen, evaluation);

      // A pure updater, so StrictMode's double call is harmless.
      setTree((current) => applyReviewNags(current, review));
      setResult({ review, evals, cancelled, total: positions });
    } catch (reviewError) {
      setError(
        `Game review failed: ${reviewError instanceof Error ? reviewError.message : "the engine stopped working"}.`
      );
    } finally {
      setProgress(null);
      setRunning(false);
    }
  }

  function cancel() {
    cancelRef.current = true;
  }

  /** Forget the last review, e.g. when a new game or position is loaded. */
  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  const view = useMemo<ReviewView | null>(() => {
    if (!result) return null;
    const { review, evals, cancelled, total } = result;
    return { review, points: reviewGraphPoints(tree, review, evals), cancelled, evaluated: evals.size, total };
  }, [result, tree]);

  return {
    running,
    progress,
    view,
    error,
    preset,
    setPreset,
    start,
    cancel,
    reset,
    reviewedMoves: result?.review.moves
  };
}
