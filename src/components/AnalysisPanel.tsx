import { Bot, ChevronLeft, ChevronRight, Eye, EyeOff, Pause, Search, X } from "lucide-react";
import type { AnalysisLine, AnalyzerStatus } from "../lib/analysis";
import { scoreLabelForFen } from "../lib/evaluation";
import { CollapsiblePanel } from "./CollapsiblePanel";

export type ActiveVariationView = {
  multipv: number;
  ply: number;
  total: number;
};

type AnalysisPanelProps = {
  status: AnalyzerStatus;
  lines: AnalysisLine[];
  bestMove?: string;
  message?: string;
  fen: string;
  depth: number;
  multipv: number;
  activeVariation: ActiveVariationView | null;
  showBoardArrows: boolean;
  canAnalyze: boolean;
  onDepthChange: (depth: number) => void;
  onMultipvChange: (multipv: number) => void;
  onAnalyze: () => void;
  onStop: () => void;
  onToggleBoardArrows: () => void;
  onSelectLine: (line: AnalysisLine, ply: number) => void;
  onStepVariation: (direction: -1 | 1) => void;
  onExitVariation: () => void;
};

export function AnalysisPanel({
  status,
  lines,
  bestMove,
  message,
  fen,
  depth,
  multipv,
  activeVariation,
  showBoardArrows,
  canAnalyze,
  onDepthChange,
  onMultipvChange,
  onAnalyze,
  onStop,
  onToggleBoardArrows,
  onSelectLine,
  onStepVariation,
  onExitVariation
}: AnalysisPanelProps) {
  const activeLine = lines.find((line) => line.multipv === activeVariation?.multipv);

  return (
    <CollapsiblePanel
      className="analysis-panel"
      eyebrow="Engine"
      title="Analysis"
      defaultExpanded
      actions={
        <span className={`status-pill status-${status}`}>{status}</span>
      }
    >

      <div className="engine-controls">
        <label>
          Depth
          <input
            type="range"
            min={6}
            max={20}
            value={depth}
            onChange={(event) => onDepthChange(Number(event.target.value))}
          />
          <span>{depth}</span>
        </label>
        <label>
          Lines
          <select value={multipv} onChange={(event) => onMultipvChange(Number(event.target.value))}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
      </div>

      <div className="split-actions">
        <button className="primary-button" type="button" disabled={!canAnalyze} onClick={onAnalyze}>
          <Search size={16} />
          Analyze
        </button>
        <button
          className={`secondary-button ${showBoardArrows ? "active" : ""}`}
          type="button"
          disabled={!canAnalyze}
          onClick={onToggleBoardArrows}
        >
          {showBoardArrows ? <EyeOff size={16} /> : <Eye size={16} />}
          {showBoardArrows ? "Hide arrows" : "Show arrows"}
        </button>
        <button className="secondary-button" type="button" onClick={onStop}>
          <Pause size={16} />
          Stop
        </button>
      </div>

      {activeVariation && activeLine ? (
        <div className="variation-controls" aria-label="Variation controls">
          <button
            className="icon-button"
            type="button"
            title="Previous variation move"
            disabled={activeVariation.ply <= 0}
            onClick={() => onStepVariation(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <div className="variation-readout">
            <span>Line {activeVariation.multipv}</span>
            <strong>
              {activeVariation.ply} / {activeVariation.total}
            </strong>
          </div>
          <button
            className="icon-button"
            type="button"
            title="Next variation move"
            disabled={activeVariation.ply >= activeVariation.total}
            onClick={() => onStepVariation(1)}
          >
            <ChevronRight size={18} />
          </button>
          <button className="secondary-button compact-button" type="button" onClick={onExitVariation}>
            <X size={15} />
            Current
          </button>
        </div>
      ) : null}

      {message ? <p className="engine-message">{message}</p> : null}

      <div className="line-list">
        {lines.length ? (
          lines.map((line) => (
            <div
              className={`analysis-line ${
                activeVariation?.multipv === line.multipv ? "active-line" : ""
              }`}
              key={line.multipv}
            >
              <div className="line-score">
                <strong>{scoreLabelForFen(line.score, fen)}</strong>
                <span>d{line.depth}</span>
              </div>
              <div className="line-body">
                <button
                  className="line-moves"
                  type="button"
                  disabled={!line.uciMoves[0]}
                  onClick={() => line.uciMoves[0] && onSelectLine(line, 1)}
                >
                  {line.sanMoves.join(" ") || line.uciMoves.join(" ")}
                </button>
                <div className="move-chip-row" aria-label={`Line ${line.multipv} moves`}>
                  {(line.sanMoves.length ? line.sanMoves : line.uciMoves).map((move, index) => {
                    const ply = index + 1;
                    const isActive =
                      activeVariation?.multipv === line.multipv && activeVariation.ply === ply;

                    return (
                      <button
                        className={`move-chip ${isActive ? "active" : ""}`}
                        key={`${line.multipv}-${move}-${index}`}
                        type="button"
                        onClick={() => onSelectLine(line, ply)}
                      >
                        <span>{ply}</span>
                        {move}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-lines">
            <Bot size={22} />
            <span>No lines yet</span>
          </div>
        )}
      </div>

      {bestMove ? <p className="best-move">Best move: {bestMove}</p> : null}
    </CollapsiblePanel>
  );
}
