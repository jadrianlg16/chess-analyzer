import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, FlipVertical2 } from "lucide-react";

type GameNavBarProps = {
  canBack: boolean;
  canForward: boolean;
  atStart: boolean;
  onStart: () => void;
  onPrev: () => void;
  onNext: () => void;
  onEnd: () => void;
  onFlip: () => void;
  ply: number;
  total: number;
};

export function GameNavBar({
  canBack,
  canForward,
  atStart,
  onStart,
  onPrev,
  onNext,
  onEnd,
  onFlip,
  ply,
  total
}: GameNavBarProps) {
  return (
    <div className="game-nav" role="group" aria-label="Move navigation">
      <button
        className="nav-button"
        type="button"
        title="Jump to start (Home)"
        aria-label="Jump to start"
        disabled={atStart}
        onClick={onStart}
      >
        <ChevronFirst size={18} />
      </button>
      <button
        className="nav-button"
        type="button"
        title="Previous move (←)"
        aria-label="Previous move"
        disabled={!canBack}
        onClick={onPrev}
      >
        <ChevronLeft size={18} />
      </button>

      <span className="nav-counter" aria-live="polite">
        {total ? `${ply} / ${total}` : "Start"}
      </span>

      <button
        className="nav-button"
        type="button"
        title="Next move (→)"
        aria-label="Next move"
        disabled={!canForward}
        onClick={onNext}
      >
        <ChevronRight size={18} />
      </button>
      <button
        className="nav-button"
        type="button"
        title="Jump to end (End)"
        aria-label="Jump to end"
        disabled={!canForward}
        onClick={onEnd}
      >
        <ChevronLast size={18} />
      </button>

      <button
        className="nav-button nav-flip"
        type="button"
        title="Flip board (F)"
        aria-label="Flip board"
        onClick={onFlip}
      >
        <FlipVertical2 size={16} />
      </button>
    </div>
  );
}
