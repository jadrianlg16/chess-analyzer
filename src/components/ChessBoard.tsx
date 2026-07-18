import { useState, type DragEvent } from "react";
import type { Square } from "chess.js";
import { files, ranks, type BoardMap } from "../lib/position";
import type { BoardTheme, PieceTheme } from "../lib/themes";
import { PieceIcon } from "./PieceIcon";

export type BoardArrow = {
  from: Square;
  to: Square;
  tone: "best" | "line";
};

type ChessBoardProps = {
  board: BoardMap;
  orientation: "w" | "b";
  boardTheme: BoardTheme;
  pieceTheme: PieceTheme;
  selectedSquare?: Square | null;
  legalTargets: Square[];
  lastMove?: { from: Square; to: Square } | null;
  arrows: BoardArrow[];
  draggable?: boolean;
  onSquareClick: (square: Square) => void;
  onMove?: (from: Square, to: Square) => void;
};

export function ChessBoard({
  board,
  orientation,
  boardTheme,
  pieceTheme,
  selectedSquare,
  legalTargets,
  lastMove,
  arrows,
  draggable = false,
  onSquareClick,
  onMove
}: ChessBoardProps) {
  const [dragFrom, setDragFrom] = useState<Square | null>(null);
  const [dragOver, setDragOver] = useState<Square | null>(null);

  const orderedRanks = orientation === "w" ? ranks : [...ranks].reverse();
  const orderedFiles = orientation === "w" ? files : [...files].reverse();

  function handleDrop(event: DragEvent<HTMLButtonElement>, square: Square) {
    event.preventDefault();
    const from = (event.dataTransfer.getData("text/plain") || dragFrom) as Square;
    setDragFrom(null);
    setDragOver(null);
    if (from && from !== square) onMove?.(from, square);
  }

  return (
    <div className="board-wrap">
      <div
        className={`board board-theme-${boardTheme} piece-theme-${pieceTheme} ${dragFrom ? "dragging" : ""}`}
        role="grid"
        aria-label="Chess board"
      >
        <svg className="board-arrows" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <marker
              id="arrow-best"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="3.5"
              markerHeight="3.5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
            <marker
              id="arrow-line"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="3"
              markerHeight="3"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>
          {arrows.map((arrow, index) => {
            const from = squareCenter(arrow.from, orientation);
            const to = squareCenter(arrow.to, orientation);
            return (
              <line
                key={`${arrow.from}-${arrow.to}-${index}`}
                className={`arrow arrow-${arrow.tone}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                markerEnd={`url(#arrow-${arrow.tone})`}
              />
            );
          })}
        </svg>

        {orderedRanks.flatMap((rank, rankIndex) =>
          orderedFiles.map((file, fileIndex) => {
            const square = `${file}${rank}` as Square;
            const piece = board[square];
            const isDark = (fileIndex + rankIndex) % 2 === 1;
            const isLegal = legalTargets.includes(square);
            const isLast = lastMove?.from === square || lastMove?.to === square;
            const canDrag = draggable && Boolean(piece);

            return (
              <button
                key={square}
                className={[
                  "square",
                  isDark ? "square-dark" : "square-light",
                  selectedSquare === square ? "selected" : "",
                  isLegal ? "legal" : "",
                  isLast ? "last-move" : "",
                  dragOver === square ? "drop-target" : ""
                ].join(" ")}
                type="button"
                role="gridcell"
                aria-label={square}
                onClick={() => onSquareClick(square)}
                onDragOver={(event) => {
                  if (!draggable) return;
                  event.preventDefault();
                  if (dragOver !== square) setDragOver(square);
                }}
                onDrop={(event) => handleDrop(event, square)}
              >
                {piece ? (
                  <span
                    className={`piece-holder ${isLast && lastMove?.to === square ? "just-moved" : ""} ${
                      dragFrom === square ? "drag-source" : ""
                    }`}
                    draggable={canDrag}
                    onDragStart={(event) => {
                      if (!canDrag) {
                        event.preventDefault();
                        return;
                      }
                      event.dataTransfer.setData("text/plain", square);
                      event.dataTransfer.effectAllowed = "move";
                      setDragFrom(square);
                    }}
                    onDragEnd={() => {
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                  >
                    <PieceIcon piece={piece} theme={pieceTheme} />
                  </span>
                ) : null}
                {file === orderedFiles[0] ? <span className="rank-label">{rank}</span> : null}
                {rank === orderedRanks[orderedRanks.length - 1] ? (
                  <span className="file-label">{file}</span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function squareCenter(square: Square, orientation: "w" | "b") {
  const file = files.indexOf(square[0] as (typeof files)[number]);
  const rank = Number(square[1]);
  const col = orientation === "w" ? file : 7 - file;
  const row = orientation === "w" ? 8 - rank : rank - 1;

  return {
    x: col * 12.5 + 6.25,
    y: row * 12.5 + 6.25
  };
}
