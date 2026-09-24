import type { EngineScore } from "./engine";
import { uciLineToSan } from "./position";

type Side = "w" | "b";

/** What the engine thinks of one position (score from the side to move's view). */
export type PositionEval = {
  score: EngineScore;
  bestMove?: string;
  depth: number;
};

export type Judgement = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

export type MoveJudgement = {
  judgement: Judgement;
  /** Mover's winning percentage (0-100) before and after the move. */
  winBefore: number;
  winAfter: number;
  /** Per-move accuracy, 0-100. */
  accuracy: number;
  reason?: "allowed-mate" | "missed-mate";
};

export type MoveReview = MoveJudgement & {
  nodeId: string;
  color: Side;
  bestMove?: string;
  bestSan?: string;
};

export type SideSummary = {
  moves: number;
  accuracy: number | null;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
};

export type GameReview = {
  moves: Record<string, MoveReview>;
  white: SideSummary;
  black: SideSummary;
};

export type ReviewedMove = {
  id: string;
  color: Side;
  uci: string;
  fen: string;
  parentFen: string;
};

const MATE_VALUE = 100_000;
const CP_CEILING = 1000;
// Lichess's logistic fit from centipawns to winning chances.
const WIN_SLOPE = 0.00368208;

/**
 * An engine score as a single number from `pov`'s side: centipawns, or
 * ±(MATE_VALUE - moves) for forced mates so faster mates rank higher.
 */
export function povValue(score: EngineScore, sideToMove: Side, pov: Side): number {
  const sign = sideToMove === pov ? 1 : -1;
  if (score.kind === "mate") {
    // `mate 0`: the side to move is already checkmated.
    if (score.value === 0) return -sign * MATE_VALUE;
    return sign * Math.sign(score.value) * (MATE_VALUE - Math.abs(score.value));
  }
  return sign * score.value;
}

export function isMateFor(value: number) {
  return value >= MATE_VALUE - CP_CEILING;
}

export function isMateAgainst(value: number) {
  return value <= -(MATE_VALUE - CP_CEILING);
}

/** Winning chances in [-1, 1]; centipawns are capped at ±10 pawns like Lichess. */
export function winningChances(value: number): number {
  if (isMateFor(value)) return 1;
  if (isMateAgainst(value)) return -1;
  const cp = Math.max(-CP_CEILING, Math.min(CP_CEILING, value));
  return 2 / (1 + Math.exp(-WIN_SLOPE * cp)) - 1;
}

export function winPercent(value: number): number {
  return 50 + 50 * winningChances(value);
}

/** Lichess's per-move accuracy formula, from the drop in the mover's win %. */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const drop = Math.max(0, winBefore - winAfter);
  const accuracy = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669;
  return Math.max(0, Math.min(100, accuracy));
}

/**
 * Grade one move from the engine's view of the position before it (mover to
 * move) and after it (opponent to move). Playing the engine's own best move is
 * never an error: comparing two separate searches can otherwise punish the best
 * move when the second search misjudges the position (horizon effect).
 */
export function judgeMove(input: {
  mover: Side;
  before: PositionEval;
  after: PositionEval;
  playedUci: string;
}): MoveJudgement {
  const opponent: Side = input.mover === "w" ? "b" : "w";
  const before = povValue(input.before.score, input.mover, input.mover);
  const after = povValue(input.after.score, opponent, input.mover);
  const winBefore = winPercent(before);
  const winAfter = winPercent(after);

  if (input.before.bestMove && input.before.bestMove === input.playedUci) {
    return { judgement: "best", winBefore, winAfter, accuracy: 100 };
  }

  const accuracy = moveAccuracy(winBefore, winAfter);

  if (!isMateAgainst(before) && isMateAgainst(after)) {
    const judgement = before <= -999 ? "inaccuracy" : before <= -700 ? "mistake" : "blunder";
    return { judgement, winBefore, winAfter, accuracy, reason: "allowed-mate" };
  }

  if (isMateFor(before) && !isMateFor(after)) {
    const judgement = after >= 999 ? "inaccuracy" : after >= 700 ? "mistake" : "blunder";
    return { judgement, winBefore, winAfter, accuracy, reason: "missed-mate" };
  }

  const drop = winningChances(before) - winningChances(after);
  const judgement: Judgement =
    drop >= 0.3 ? "blunder" : drop >= 0.2 ? "mistake" : drop >= 0.1 ? "inaccuracy" : "good";
  return { judgement, winBefore, winAfter, accuracy };
}

/** Grade every move that has an evaluation for the position before and after it. */
export function buildReview(moves: ReviewedMove[], evals: Map<string, PositionEval>): GameReview {
  const reviewed: Record<string, MoveReview> = {};

  for (const move of moves) {
    const before = evals.get(move.parentFen);
    const after = evals.get(move.fen);
    if (!before || !after) continue;

    const judged = judgeMove({ mover: move.color, before, after, playedUci: move.uci });
    const bestSan = before.bestMove ? uciLineToSan(move.parentFen, [before.bestMove])[0] : undefined;
    reviewed[move.id] = {
      ...judged,
      nodeId: move.id,
      color: move.color,
      ...(before.bestMove ? { bestMove: before.bestMove } : {}),
      ...(bestSan ? { bestSan } : {})
    };
  }

  return {
    moves: reviewed,
    white: summarize(Object.values(reviewed).filter((move) => move.color === "w")),
    black: summarize(Object.values(reviewed).filter((move) => move.color === "b"))
  };
}

function summarize(moves: MoveReview[]): SideSummary {
  const count = (judgement: Judgement) => moves.filter((move) => move.judgement === judgement).length;
  return {
    moves: moves.length,
    accuracy: moves.length
      ? moves.reduce((total, move) => total + move.accuracy, 0) / moves.length
      : null,
    inaccuracies: count("inaccuracy"),
    mistakes: count("mistake"),
    blunders: count("blunder")
  };
}
