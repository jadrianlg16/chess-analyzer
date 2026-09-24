import { UciEngine, type EngineScore, type UciInfo, type WorkerLike } from "./engine";
import { uciLineToSan } from "./position";

export type { EngineScore } from "./engine";

export type AnalysisLine = {
  multipv: number;
  depth: number;
  score: EngineScore;
  uciMoves: string[];
  sanMoves: string[];
};

export type AnalyzerStatus = "idle" | "loading" | "analyzing" | "ready" | "error";

export type AnalysisUpdate = {
  status: AnalyzerStatus;
  lines: AnalysisLine[];
  /** Position these lines belong to. Updates for any other position are stale. */
  fen?: string;
  bestMove?: string;
  message?: string;
};

export type AnalyzeOptions = {
  depth: number;
  multipv: number;
};

export const ENGINE_PATH = `${import.meta.env.BASE_URL}vendor/stockfish/stockfish-18-lite-single.js`;

export function createEngineWorker(): WorkerLike {
  return new Worker(ENGINE_PATH);
}

/**
 * Live analysis for the position on the board. Each `analyze()` call starts a
 * new generation; updates from older generations are dropped, so the panel can
 * never show lines that belong to a previous position.
 */
export class StockfishClient {
  private readonly engine: UciEngine;
  private readonly onUpdate: (update: AnalysisUpdate) => void;
  private generation = 0;
  private lastUpdate: AnalysisUpdate = { status: "idle", lines: [] };

  constructor(
    onUpdate: (update: AnalysisUpdate) => void,
    options: { createWorker?: () => WorkerLike } = {}
  ) {
    this.onUpdate = onUpdate;
    this.engine = new UciEngine({ createWorker: options.createWorker ?? createEngineWorker });
  }

  analyze(fen: string, options: AnalyzeOptions) {
    const generation = ++this.generation;
    const toLines = sanConverter(fen);
    this.emit(generation, { status: "loading", lines: [], fen });

    this.engine
      .search({
        fen,
        multipv: options.multipv,
        limits: { depth: options.depth },
        onInfo: (lines) => this.emit(generation, { status: "analyzing", lines: toLines(lines), fen })
      })
      .then(
        (result) =>
          this.emit(generation, {
            status: "ready",
            lines: toLines(result.lines),
            fen,
            ...(result.bestMove ? { bestMove: result.bestMove } : {}),
            ...(result.restarts
              ? { message: "Stockfish crashed and was restarted automatically." }
              : {})
          }),
        (error: unknown) =>
          this.emit(generation, {
            status: "error",
            lines: [],
            fen,
            message: `Stockfish stopped working (${
              error instanceof Error ? error.message : "unknown error"
            }). Press Analyze to try again.`
          })
      );
  }

  /** Stop the current search. With `emit` (default) the panel keeps the lines found so far. */
  stop(options: { emit?: boolean } = {}) {
    const generation = ++this.generation;
    this.engine.stop();
    if (options.emit !== false) {
      this.emit(generation, { ...this.lastUpdate, status: this.lastUpdate.status === "error" ? "error" : "ready" });
    }
  }

  dispose() {
    this.generation += 1;
    this.engine.dispose();
  }

  private emit(generation: number, update: AnalysisUpdate) {
    if (generation !== this.generation) return;
    this.lastUpdate = update;
    this.onUpdate(update);
  }
}

/** Convert engine lines to display lines, caching SAN per PV since the same PV repeats often. */
function sanConverter(fen: string) {
  const cache = new Map<string, string[]>();
  return (lines: UciInfo[]): AnalysisLine[] =>
    lines.map((line) => {
      const key = line.pv.join(" ");
      let sanMoves = cache.get(key);
      if (!sanMoves) {
        sanMoves = uciLineToSan(fen, line.pv);
        cache.set(key, sanMoves);
      }
      return {
        multipv: line.multipv,
        depth: line.depth,
        score: line.score,
        uciMoves: line.pv,
        sanMoves
      };
    });
}
