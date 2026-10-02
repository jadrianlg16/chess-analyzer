import { useCallback, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { EvalPoint } from "../components/EvalGraph";
import type { ReviewView } from "../components/MovePanel";
import { REVIEW_PRESETS, reviewGame, type ReviewPreset } from "../lib/gameAnalysis";
import { mainlineNodes, setNag, type GameTree } from "../lib/gameTree";
import { nagForJudgement } from "../lib/nags";
import { sideToMove } from "../lib/position";
import { povValue, winPercent, type GameReview, type PositionEval } from "../lib/review";

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

function whiteWinPercent(evaluation: PositionEval | undefined, fen: string): number | null {
  if (!evaluation) return null;
  return winPercent(povValue(evaluation.score, sideToMove(fen), "w"));
}

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
    const nodes = mainlineNodes(tree);
    if (!nodes.length || running) return;

    cancelRef.current = false;
    setRunning(true);
    onStart();
    setResult(null);
    setError(null);

    const moves = nodes.map((node) => ({
      id: node.id,
      color: node.color,
      uci: node.uci,
      fen: node.fen,
      parentFen: node.parentId ? tree.nodes[node.parentId]?.fen ?? tree.rootFen : tree.rootFen
    }));
    setProgress({ done: 0, total: nodes.length + 1 });

    try {
      const { review, evals, cancelled, positions } = await reviewGame(moves, tree.rootFen, REVIEW_PRESETS[preset].nodes, {
        onProgress: (done, total) => setProgress({ done, total }),
        isCancelled: () => cancelRef.current
      });

      for (const [positionFen, evaluation] of evals) evalCache.current.set(positionFen, evaluation);

      // Apply NAGs in one pure updater (safe under StrictMode).
      setTree((current) => {
        let next = current;
        for (const move of Object.values(review.moves)) {
          next = setNag(next, move.nodeId, nagForJudgement(move.judgement));
        }
        return next;
      });
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
    const points: EvalPoint[] = [
      { id: null, label: "Start", whiteWin: whiteWinPercent(evals.get(tree.rootFen), tree.rootFen) },
      ...mainlineNodes(tree).map((node) => ({
        id: node.id,
        label: `${node.moveNumber}${node.color === "w" ? "." : "…"} ${node.san}`,
        whiteWin: whiteWinPercent(evals.get(node.fen), node.fen),
        ...(review.moves[node.id] ? { judgement: review.moves[node.id].judgement } : {})
      }))
    ];
    return { review, points, cancelled, evaluated: evals.size, total };
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
