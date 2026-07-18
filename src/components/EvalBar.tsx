import type { CSSProperties } from "react";
import type { AnalysisLine, AnalyzerStatus } from "../lib/analysis";
import { evaluationFromLine } from "../lib/evaluation";

type EvalBarProps = {
  fen: string;
  line?: AnalysisLine;
  status: AnalyzerStatus;
};

export function EvalBar({ fen, line, status }: EvalBarProps) {
  const evaluation = evaluationFromLine(fen, line);
  const thinking = status === "loading" || status === "analyzing";
  const style = {
    "--white-share": `${evaluation.whiteShare}%`
  } as CSSProperties;

  return (
    <aside
      className={`eval-bar eval-bar-${evaluation.leader}`}
      aria-label={`Position evaluation: ${evaluation.ariaLabel}`}
      title={evaluation.ariaLabel}
    >
      <div className="eval-meter" style={style}>
        <span className="eval-center-mark" aria-hidden="true" />
        <span className="eval-side-tag eval-side-white" aria-hidden="true">
          W
        </span>
        <span className="eval-side-tag eval-side-black" aria-hidden="true">
          B
        </span>
        <span className={`eval-score-pill eval-score-${evaluation.placement}`} aria-hidden="true">
          <strong>{thinking && !line ? "..." : evaluation.label}</strong>
          <small>{thinking && line ? "Live" : evaluation.caption}</small>
        </span>
      </div>
    </aside>
  );
}
