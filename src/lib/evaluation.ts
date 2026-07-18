import type { AnalysisLine, EngineScore } from "./analysis";

type EvaluationLeader = "white" | "black" | "equal" | "unknown";
type EvaluationPlacement = "top" | "middle" | "bottom";

export type EvaluationDisplay = {
  leader: EvaluationLeader;
  placement: EvaluationPlacement;
  label: string;
  caption: string;
  whiteShare: number;
  ariaLabel: string;
};

const EQUAL_THRESHOLD_CP = 20;
const BAR_CAP_CP = 800;

export function scoreToWhitePerspective(score: EngineScore, fen: string): EngineScore {
  const turn = fen.split(/\s+/)[1] === "b" ? "b" : "w";
  const multiplier = turn === "w" ? 1 : -1;

  return {
    kind: score.kind,
    value: score.value * multiplier
  };
}

export function scoreLabelForFen(score: EngineScore, fen: string): string {
  return scoreLabelFromWhite(scoreToWhitePerspective(score, fen));
}

export function evaluationFromLine(fen: string, line?: AnalysisLine): EvaluationDisplay {
  if (!line) {
    return {
      leader: "unknown",
      placement: "middle",
      label: "--",
      caption: "No eval",
      whiteShare: 50,
      ariaLabel: "No engine evaluation yet"
    };
  }

  const score = scoreToWhitePerspective(line.score, fen);

  if (score.kind === "mate") {
    const leader = score.value > 0 ? "white" : "black";
    const moves = Math.abs(score.value);

    return {
      leader,
      placement: leader === "white" ? "top" : "bottom",
      label: `M${moves}`,
      caption: leader === "white" ? "White" : "Black",
      whiteShare: leader === "white" ? 96 : 4,
      ariaLabel: `${leader === "white" ? "White" : "Black"} has mate in ${moves}`
    };
  }

  const cp = score.value;
  const leader =
    Math.abs(cp) <= EQUAL_THRESHOLD_CP ? "equal" : cp > 0 ? "white" : "black";
  const whiteShare = clamp(50 + (clamp(cp, -BAR_CAP_CP, BAR_CAP_CP) / BAR_CAP_CP) * 50, 4, 96);
  const label = formatCentipawn(cp);

  return {
    leader,
    placement: leader === "white" ? "top" : leader === "black" ? "bottom" : "middle",
    label,
    caption: leader === "equal" ? "Equal" : leader === "white" ? "White" : "Black",
    whiteShare,
    ariaLabel:
      leader === "equal"
        ? `${label}, equal position`
        : `${label}, ${leader === "white" ? "White" : "Black"} is better`
  };
}

function scoreLabelFromWhite(score: EngineScore): string {
  if (score.kind === "mate") {
    return score.value > 0 ? `+M${score.value}` : `-M${Math.abs(score.value)}`;
  }

  return formatCentipawn(score.value);
}

function formatCentipawn(value: number) {
  const pawns = value / 100;
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
