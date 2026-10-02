import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { AnalysisUpdate } from "../lib/analysis";
import { currentNode, setNag, type GameTree } from "../lib/gameTree";
import { nagForJudgement } from "../lib/nags";
import { judgeMove, type MoveReview, type PositionEval } from "../lib/review";

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

/**
 * Best-effort move grading while exploring: when the engine settles on the
 * board position, cache its eval and grade the move that led here against
 * its parent's eval, if that is cached too.
 */
export function useMoveGrading({ analysis, fen, enabled, tree, setTree, reviewedMoves, evalCache }: MoveGradingOptions) {
  useEffect(() => {
    if (!enabled) return;
    if (analysis.status !== "ready" || analysis.fen !== fen) return;
    const top = analysis.lines[0];
    if (!top) return;

    const bestMove = analysis.bestMove ?? top.uciMoves[0];
    const evaluation: PositionEval = { score: top.score, depth: top.depth, ...(bestMove ? { bestMove } : {}) };
    evalCache.current.set(fen, evaluation);

    const node = currentNode(tree);
    if (!node || reviewedMoves?.[node.id]) return;
    const parentFen = node.parentId ? tree.nodes[node.parentId]?.fen ?? tree.rootFen : tree.rootFen;
    const parent = evalCache.current.get(parentFen);
    if (!parent) return;

    const { judgement } = judgeMove({ mover: node.color, before: parent, after: evaluation, playedUci: node.uci });
    const nag = nagForJudgement(judgement);
    if (node.nag !== nag) setTree((current) => setNag(current, node.id, nag));
  }, [analysis, enabled, evalCache, fen, reviewedMoves, setTree, tree]);
}
