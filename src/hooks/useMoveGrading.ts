import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { AnalysisUpdate } from "../lib/analysis";
import { setNag, type GameTree } from "../lib/gameTree";
import type { MoveReview, PositionEval } from "../lib/review";
import { gradeExploredMove } from "../lib/reviewTree";

type MoveGradingOptions = {
  analysis: AnalysisUpdate;
  fen: string;
  /** Off in setup mode and while a game review is running. */
  enabled: boolean;
  tree: GameTree;
  setTree: Dispatch<SetStateAction<GameTree>>;
  /** Moves graded by the last game review; they keep that verdict. */
  reviewedMoves: Record<string, MoveReview> | undefined;
  /** Evaluations by FEN, shared with the game review. */
  evalCache: MutableRefObject<Map<string, PositionEval>>;
};

/** Marks moves with ?!, ? or ?? while exploring, as live analysis settles on each position. */
export function useMoveGrading({
  analysis,
  fen,
  enabled,
  tree,
  setTree,
  reviewedMoves,
  evalCache
}: MoveGradingOptions) {
  useEffect(() => {
    if (!enabled) return;
    const change = gradeExploredMove({ analysis, fen, tree, reviewedMoves, cache: evalCache.current });
    if (change) setTree((current) => setNag(current, change.nodeId, change.nag));
  }, [analysis, enabled, evalCache, fen, reviewedMoves, setTree, tree]);
}
