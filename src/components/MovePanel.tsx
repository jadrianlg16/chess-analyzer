import { Fragment, useEffect, useState, type ReactNode } from "react";
import { ArrowUpNarrowWide, Download, Sparkles, Square as StopIcon, Trash2, Upload } from "lucide-react";
import type { GameTree } from "../lib/gameTree";
import { childrenOf } from "../lib/gameTree";
import { REVIEW_PRESETS, type ReviewPreset } from "../lib/gameAnalysis";
import { nagGlyph } from "../lib/nags";
import type { GameReview, MoveReview, SideSummary } from "../lib/review";
import { CollapsiblePanel } from "./CollapsiblePanel";
import { EvalGraph, type EvalPoint } from "./EvalGraph";

export type ReviewView = {
  review: GameReview;
  points: EvalPoint[];
  cancelled: boolean;
  evaluated: number;
  total: number;
};

type MovePanelProps = {
  tree: GameTree;
  pgn: string;
  pgnInput: string;
  onPgnInputChange: (pgn: string) => void;
  onLoadPgn: () => void;
  onCopyPgn: () => void;
  onGoTo: (id: string | null) => void;
  onPromote: (id: string) => void;
  onDelete: (id: string) => void;
  onAnalyzeGame: () => void;
  onCancelAnalyzeGame: () => void;
  analyzing: boolean;
  analyzeProgress: { done: number; total: number } | null;
  reviewView: ReviewView | null;
  reviewError: string | null;
  reviewPreset: ReviewPreset;
  onReviewPresetChange: (preset: ReviewPreset) => void;
  canAnalyzeGame: boolean;
};

type ContextMenu = { id: string; x: number; y: number } | null;

export function MovePanel({
  tree,
  pgn,
  pgnInput,
  onPgnInputChange,
  onLoadPgn,
  onCopyPgn,
  onGoTo,
  onPromote,
  onDelete,
  onAnalyzeGame,
  onCancelAnalyzeGame,
  analyzing,
  analyzeProgress,
  reviewView,
  reviewError,
  reviewPreset,
  onReviewPresetChange,
  canAnalyzeGame
}: MovePanelProps) {
  const reviews = reviewView?.review.moves ?? null;
  const currentNode = tree.currentId ? tree.nodes[tree.currentId] : undefined;
  const currentReview = currentNode ? reviews?.[currentNode.id] : undefined;
  const [menu, setMenu] = useState<ContextMenu>(null);
  const hasMoves = tree.rootChildren.length > 0;

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  return (
    <CollapsiblePanel
      className="move-panel"
      eyebrow="Game"
      title="Moves"
      defaultExpanded
      actions={
        <button className="icon-button" type="button" title="Copy PGN" onClick={onCopyPgn}>
          <Download size={17} />
        </button>
      }
    >
      <div className="analyze-game">
        {analyzing ? (
          <button className="secondary-button analyze-game-btn" type="button" onClick={onCancelAnalyzeGame}>
            <StopIcon size={15} />
            Stop ({analyzeProgress ? `${analyzeProgress.done}/${analyzeProgress.total}` : "…"})
          </button>
        ) : (
          <>
            <button
              className="secondary-button analyze-game-btn"
              type="button"
              disabled={!canAnalyzeGame}
              onClick={onAnalyzeGame}
            >
              <Sparkles size={15} />
              Analyze game
            </button>
            <select
              className="review-preset"
              aria-label="Review strength"
              title="How long the engine looks at each position"
              value={reviewPreset}
              onChange={(event) => onReviewPresetChange(event.target.value as ReviewPreset)}
            >
              {(Object.keys(REVIEW_PRESETS) as ReviewPreset[]).map((preset) => (
                <option key={preset} value={preset}>
                  {REVIEW_PRESETS[preset].label}
                </option>
              ))}
            </select>
          </>
        )}

        {analyzing && analyzeProgress ? (
          <div className="analyze-progress" aria-hidden="true">
            <div
              className="analyze-progress-fill"
              style={{
                width: `${analyzeProgress.total ? (analyzeProgress.done / analyzeProgress.total) * 100 : 0}%`
              }}
            />
          </div>
        ) : null}

      </div>

      {reviewError && !analyzing ? <p className="engine-message">{reviewError}</p> : null}

      {reviewView && !analyzing ? (
        <div className="game-review">
          <div className="review-summary" aria-label="Game review summary">
            <SideRow name="White" summary={reviewView.review.white} />
            <SideRow name="Black" summary={reviewView.review.black} />
          </div>
          {reviewView.cancelled ? (
            <p className="review-note">
              Review stopped early: {reviewView.evaluated} of {reviewView.total} positions evaluated.
            </p>
          ) : null}
          <EvalGraph points={reviewView.points} currentId={tree.currentId} onSelect={onGoTo} />
          {currentNode ? (
            <MoveVerdict
              label={`${currentNode.moveNumber}${currentNode.color === "w" ? "." : "…"} ${currentNode.san}`}
              review={currentReview}
            />
          ) : null}
        </div>
      ) : null}

      <div className="movetext" role="list" aria-label="Move list">
        {hasMoves ? (
          <Branch
            tree={tree}
            childrenIds={tree.rootChildren}
            startsSequence
            depth={0}
            currentId={tree.currentId}
            reviews={reviews}
            onGoTo={onGoTo}
            onContext={(id, x, y) => setMenu({ id, x, y })}
          />
        ) : (
          <span className="move-empty">No moves yet — play on the board or load a PGN.</span>
        )}
      </div>

      {menu ? (
        <div
          className="move-context-menu"
          style={{ top: menu.y, left: menu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              onPromote(menu.id);
              setMenu(null);
            }}
          >
            <ArrowUpNarrowWide size={14} />
            Promote to main line
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              onDelete(menu.id);
              setMenu(null);
            }}
          >
            <Trash2 size={14} />
            Delete from here
          </button>
        </div>
      ) : null}

      <label className="textarea-field">
        PGN
        <textarea value={pgnInput} onChange={(event) => onPgnInputChange(event.target.value)} rows={5} />
      </label>
      <div className="split-actions">
        <button className="secondary-button" type="button" onClick={onLoadPgn}>
          <Upload size={16} />
          Load PGN
        </button>
        <input className="copy-source" readOnly value={pgn} aria-label="Current PGN" />
      </div>
    </CollapsiblePanel>
  );
}

type BranchProps = {
  tree: GameTree;
  childrenIds: string[];
  startsSequence: boolean;
  depth: number;
  currentId: string | null;
  reviews: Record<string, MoveReview> | null;
  onGoTo: (id: string) => void;
  onContext: (id: string, x: number, y: number) => void;
};

/**
 * Renders a list of alternative continuations. The first child is the main
 * line; the rest are variations rendered inline in parentheses.
 */
function Branch({ tree, childrenIds, startsSequence, depth, currentId, reviews, onGoTo, onContext }: BranchProps) {
  if (!childrenIds.length) return null;
  const [mainId, ...variations] = childrenIds;

  const tokens: ReactNode[] = [
    <MoveToken
      key={mainId}
      tree={tree}
      id={mainId}
      startsSequence={startsSequence}
      currentId={currentId}
      reviews={reviews}
      onGoTo={onGoTo}
      onContext={onContext}
    />
  ];

  for (const varId of variations) {
    tokens.push(
      <span className={`variation variation-depth-${Math.min(depth + 1, 3)}`} key={`var-${varId}`}>
        <span className="variation-paren">(</span>
        <MoveToken
          tree={tree}
          id={varId}
          startsSequence
          currentId={currentId}
          reviews={reviews}
          onGoTo={onGoTo}
          onContext={onContext}
        />
        <Branch
          tree={tree}
          childrenIds={childrenOf(tree, varId)}
          startsSequence={false}
          depth={depth + 1}
          currentId={currentId}
          reviews={reviews}
          onGoTo={onGoTo}
          onContext={onContext}
        />
        <span className="variation-paren">)</span>
      </span>
    );
  }

  tokens.push(
    <Branch
      key={`cont-${mainId}`}
      tree={tree}
      childrenIds={childrenOf(tree, mainId)}
      startsSequence={variations.length > 0}
      depth={depth}
      currentId={currentId}
      reviews={reviews}
      onGoTo={onGoTo}
      onContext={onContext}
    />
  );

  return <Fragment>{tokens}</Fragment>;
}

type MoveTokenProps = {
  tree: GameTree;
  id: string;
  startsSequence: boolean;
  currentId: string | null;
  reviews: Record<string, MoveReview> | null;
  onGoTo: (id: string) => void;
  onContext: (id: string, x: number, y: number) => void;
};

function MoveToken({ tree, id, startsSequence, currentId, reviews, onGoTo, onContext }: MoveTokenProps) {
  const node = tree.nodes[id];
  if (!node) return null;

  const showNumber = node.color === "w" || startsSequence;
  const numberLabel = node.color === "w" ? `${node.moveNumber}.` : `${node.moveNumber}…`;
  const glyph = nagGlyph(node.nag);
  const bestSan = reviews?.[id]?.bestSan;
  const title = glyph ? (bestSan ? `${glyph.label}. Best was ${bestSan}` : glyph.label) : undefined;

  return (
    <button
      type="button"
      role="listitem"
      className={`move-token ${currentId === id ? "current" : ""} ${glyph ? `quality-${glyph.quality}` : ""}`}
      onClick={() => onGoTo(id)}
      onContextMenu={(event) => {
        event.preventDefault();
        onContext(id, event.clientX, event.clientY);
      }}
      title={title}
    >
      {showNumber ? <span className="move-number">{numberLabel}</span> : null}
      <span className="move-san">{node.san}</span>
      {glyph ? <span className="move-nag">{glyph.symbol}</span> : null}
    </button>
  );
}

const VERDICT_LABEL: Record<MoveReview["judgement"], string> = {
  best: "Best move",
  good: "Good move",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder"
};

function SideRow({ name, summary }: { name: string; summary: SideSummary }) {
  return (
    <div className="review-side">
      <span className="review-side-name">{name}</span>
      <span className="review-accuracy" title="Average per-move accuracy (Lichess formula)">
        {summary.accuracy === null ? "–" : `${Math.round(summary.accuracy)}%`}
        <small>accuracy</small>
      </span>
      <span className="summary-chip quality-inaccuracy" title="Inaccuracies">
        ?! {summary.inaccuracies}
      </span>
      <span className="summary-chip quality-mistake" title="Mistakes">
        ? {summary.mistakes}
      </span>
      <span className="summary-chip quality-blunder" title="Blunders">
        ?? {summary.blunders}
      </span>
    </div>
  );
}

function MoveVerdict({ label, review }: { label: string; review: MoveReview | undefined }) {
  if (!review) {
    return (
      <p className="move-verdict">
        <strong>{label}</strong> <span className="move-verdict-note">Not part of the review.</span>
      </p>
    );
  }

  const isError =
    review.judgement === "inaccuracy" || review.judgement === "mistake" || review.judgement === "blunder";
  const reason =
    review.reason === "allowed-mate"
      ? " Allows a forced mate."
      : review.reason === "missed-mate"
        ? " Misses a forced mate."
        : "";

  return (
    <p className={`move-verdict verdict-${review.judgement}`}>
      <strong>{label}</strong> <span className="move-verdict-judgement">{VERDICT_LABEL[review.judgement]}.</span>
      {reason}
      {isError && review.bestSan ? (
        <>
          {" "}
          Best was <strong>{review.bestSan}</strong>.
        </>
      ) : null}
      <span className="move-verdict-note">
        Winning chances {Math.round(review.winBefore)}% → {Math.round(review.winAfter)}%
      </span>
    </p>
  );
}
