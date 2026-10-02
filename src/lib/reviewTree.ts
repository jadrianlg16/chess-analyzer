import type { AnalysisUpdate } from "./analysis";
import { currentNode, mainlineNodes, setNag, type GameTree } from "./gameTree";
import { nagForJudgement } from "./nags";
import { sideToMove } from "./position";
import {
  judgeMove,
  povValue,
  winPercent,
  type GameReview,
  type Judgement,
  type MoveReview,
  type PositionEval,
  type ReviewedMove
} from "./review";

/** One point of the winning-chances graph. */
export type EvalPoint = {
  /** Move node id, or null for the starting position. */
  id: string | null;
  label: string;
  /** White's winning chances in percent, or null when the position was not evaluated. */
  whiteWin: number | null;
  judgement?: Judgement;
};

function parentFenOf(tree: GameTree, parentId: string | null): string {
  return parentId ? (tree.nodes[parentId]?.fen ?? tree.rootFen) : tree.rootFen;
}

/** The main line in the shape `reviewGame` grades. */
export function mainlineReviewMoves(tree: GameTree): ReviewedMove[] {
  return mainlineNodes(tree).map((node) => ({
    id: node.id,
    color: node.color,
    uci: node.uci,
    fen: node.fen,
    parentFen: parentFenOf(tree, node.parentId)
  }));
}

/** Mark every reviewed move with its ?!, ? or ?? glyph (and clear it from good moves). */
export function applyReviewNags(tree: GameTree, review: GameReview): GameTree {
  let next = tree;
  for (const move of Object.values(review.moves)) {
    next = setNag(next, move.nodeId, nagForJudgement(move.judgement));
  }
  return next;
}

function whiteWinPercent(evaluation: PositionEval | undefined, fen: string): number | null {
  if (!evaluation) return null;
  return winPercent(povValue(evaluation.score, sideToMove(fen), "w"));
}

/** The winning-chances graph: the start position, then every main-line move. */
export function reviewGraphPoints(tree: GameTree, review: GameReview, evals: Map<string, PositionEval>): EvalPoint[] {
  return [
    { id: null, label: "Start", whiteWin: whiteWinPercent(evals.get(tree.rootFen), tree.rootFen) },
    ...mainlineNodes(tree).map((node) => ({
      id: node.id,
      label: `${node.moveNumber}${node.color === "w" ? "." : "…"} ${node.san}`,
      whiteWin: whiteWinPercent(evals.get(node.fen), node.fen),
      ...(review.moves[node.id] ? { judgement: review.moves[node.id].judgement } : {})
    }))
  ];
}

/**
 * Best-effort grading while exploring. When live analysis has settled on the
 * board position, record its eval in `cache` and grade the move that led here
 * against its parent's cached eval. Returns the glyph change to make, or null
 * when there is nothing to grade or the glyph is already right. Moves graded
 * by a game review keep that verdict.
 */
export function gradeExploredMove(input: {
  analysis: AnalysisUpdate;
  fen: string;
  tree: GameTree;
  reviewedMoves: Record<string, MoveReview> | undefined;
  cache: Map<string, PositionEval>;
}): { nodeId: string; nag: number | undefined } | null {
  const { analysis, fen, tree, reviewedMoves, cache } = input;
  if (analysis.status !== "ready" || analysis.fen !== fen) return null;
  const top = analysis.lines[0];
  if (!top) return null;

  const bestMove = analysis.bestMove ?? top.uciMoves[0];
  const evaluation: PositionEval = { score: top.score, depth: top.depth, ...(bestMove ? { bestMove } : {}) };
  cache.set(fen, evaluation);

  const node = currentNode(tree);
  if (!node || reviewedMoves?.[node.id]) return null;
  const parent = cache.get(parentFenOf(tree, node.parentId));
  if (!parent) return null;

  const { judgement } = judgeMove({ mover: node.color, before: parent, after: evaluation, playedUci: node.uci });
  const nag = nagForJudgement(judgement);
  return node.nag === nag ? null : { nodeId: node.id, nag };
}
