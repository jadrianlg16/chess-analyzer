import { useState, type MouseEvent } from "react";
import type { Judgement } from "../lib/review";

export type EvalPoint = {
  /** Move node id, or null for the starting position. */
  id: string | null;
  label: string;
  /** White's winning chances in percent, or null when the position was not evaluated. */
  whiteWin: number | null;
  judgement?: Judgement;
};

type EvalGraphProps = {
  points: EvalPoint[];
  currentId: string | null;
  onSelect: (id: string | null) => void;
};

const WIDTH = 400;
const HEIGHT = 112;
const PAD = { left: 30, right: 8, top: 8, bottom: 8 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

const MARKERS: Partial<Record<Judgement, { radius: number; label: string }>> = {
  inaccuracy: { radius: 4, label: "Inaccuracy" },
  mistake: { radius: 5, label: "Mistake" },
  blunder: { radius: 6, label: "Blunder" }
};

/**
 * White's winning chances across the game (up = better for White). Hover
 * snaps a crosshair to the nearest position; clicking jumps the board there.
 * The move list stays the accessible, readable record of the same data.
 */
export function EvalGraph({ points, currentId, onSelect }: EvalGraphProps) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;

  const x = (index: number) => PAD.left + (index / (points.length - 1)) * PLOT_W;
  const y = (win: number) => PAD.top + (1 - win / 100) * PLOT_H;
  const baseline = y(0);

  const segments: { index: number; win: number }[][] = [];
  points.forEach((point, index) => {
    if (point.whiteWin === null) {
      segments.push([]);
      return;
    }
    if (!segments.length) segments.push([]);
    segments[segments.length - 1].push({ index, win: point.whiteWin });
  });
  const runs = segments.filter((run) => run.length > 0);

  const currentIndex = points.findIndex((point) => point.id === currentId);
  const flagged = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.whiteWin !== null && point.judgement && MARKERS[point.judgement]);

  function indexFromPointer(event: MouseEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
  }

  const hovered = hover !== null ? points[hover] : null;
  const counts = flagged.reduce<Record<string, number>>((acc, { point }) => {
    acc[point.judgement!] = (acc[point.judgement!] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <figure className="eval-graph">
      <figcaption>Winning chances</figcaption>
      <div className="eval-graph-plot">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`White's winning chances over ${points.length} positions: ${counts.blunder ?? 0} blunders, ${
            counts.mistake ?? 0
          } mistakes, ${counts.inaccuracy ?? 0} inaccuracies. The move list has the same details.`}
        >
          <text className="eval-graph-tick" x={PAD.left - 6} y={y(100) + 4} textAnchor="end">
            W
          </text>
          <text className="eval-graph-tick" x={PAD.left - 6} y={y(50) + 3} textAnchor="end">
            50%
          </text>
          <text className="eval-graph-tick" x={PAD.left - 6} y={y(0)} textAnchor="end">
            B
          </text>
          <line className="eval-graph-grid" x1={PAD.left} x2={WIDTH - PAD.right} y1={y(50)} y2={y(50)} />

          {runs.map((run) => {
            const line = run.map(({ index, win }) => `${x(index)},${y(win)}`).join(" L ");
            const area = `M ${x(run[0].index)},${baseline} L ${line} L ${x(run[run.length - 1].index)},${baseline} Z`;
            return (
              <g key={run[0].index}>
                <path className="eval-graph-area" d={area} />
                <path className="eval-graph-line" d={`M ${line}`} vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}

          {currentIndex >= 0 ? (
            <line
              className="eval-graph-current"
              x1={x(currentIndex)}
              x2={x(currentIndex)}
              y1={PAD.top}
              y2={baseline}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {hover !== null ? (
            <line
              className="eval-graph-crosshair"
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={baseline}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}

          {flagged.map(({ point, index }) => (
            <circle
              key={point.id ?? "start"}
              className={`eval-graph-marker marker-${point.judgement}`}
              cx={x(index)}
              cy={y(point.whiteWin!)}
              r={MARKERS[point.judgement!]!.radius}
            />
          ))}

          <rect
            className="eval-graph-hit"
            x={PAD.left}
            y={0}
            width={PLOT_W}
            height={HEIGHT}
            onPointerMove={(event) => setHover(indexFromPointer(event))}
            onPointerLeave={() => setHover(null)}
            onClick={(event) => onSelect(points[indexFromPointer(event)].id)}
          />
        </svg>

        {hovered ? (
          <div
            className="eval-graph-tooltip"
            style={{ left: `${(x(hover!) / WIDTH) * 100}%` }}
            aria-hidden="true"
          >
            <strong>{hovered.whiteWin === null ? "Not evaluated" : `${Math.round(hovered.whiteWin)}%`}</strong>
            <span>{hovered.whiteWin === null ? "" : "White's winning chances"}</span>
            <span className="eval-graph-tooltip-move">
              {hovered.label}
              {hovered.judgement && MARKERS[hovered.judgement] ? ` · ${MARKERS[hovered.judgement]!.label}` : ""}
            </span>
          </div>
        ) : null}
      </div>
    </figure>
  );
}
