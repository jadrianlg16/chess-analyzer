import { Chess, type Move } from "chess.js";
import { moveFromUci, uciLineToSan } from "./position";

export type EngineScore = {
  kind: "cp" | "mate";
  value: number;
};

export type AnalysisLine = {
  multipv: number;
  depth: number;
  score: EngineScore;
  uciMoves: string[];
  sanMoves: string[];
};

export type AnalyzerStatus =
  | "idle"
  | "loading"
  | "analyzing"
  | "ready"
  | "fallback"
  | "error";

export type AnalysisUpdate = {
  status: AnalyzerStatus;
  lines: AnalysisLine[];
  bestMove?: string;
  message?: string;
};

export type AnalyzeOptions = {
  depth: number;
  multipv: number;
};

export const ENGINE_PATH = `${import.meta.env.BASE_URL}vendor/stockfish/stockfish-18-lite-single.js`;

export class StockfishClient {
  private worker: Worker | null = null;
  private currentFen = "";
  private acceptingMessages = false;
  private latestLines = new Map<number, AnalysisLine>();
  private onUpdate: (update: AnalysisUpdate) => void;
  private startTimer: number | null = null;

  constructor(onUpdate: (update: AnalysisUpdate) => void) {
    this.onUpdate = onUpdate;
  }

  analyze(fen: string, options: AnalyzeOptions) {
    this.currentFen = fen;
    this.acceptingMessages = false;
    this.clearStartTimer();
    this.latestLines.clear();

    try {
      this.ensureWorker();
      this.onUpdate({ status: "loading", lines: [] });
      this.send("stop");
      this.send("uci");
      this.send(`setoption name MultiPV value ${options.multipv}`);
      this.send("setoption name UCI_ShowWDL value true");
      this.send("isready");
      this.startTimer = window.setTimeout(() => {
        this.acceptingMessages = true;
        this.send("ucinewgame");
        this.send(`position fen ${fen}`);
        this.send(`go depth ${options.depth}`);
        this.onUpdate({ status: "analyzing", lines: [] });
      }, 40);
    } catch (error) {
      this.emitFallback(fen, error instanceof Error ? error.message : "Engine unavailable");
    }
  }

  stop(options: { emit?: boolean } = {}) {
    this.acceptingMessages = false;
    this.clearStartTimer();
    this.send("stop");
    if (options.emit !== false) {
      this.onUpdate({ status: "ready", lines: this.sortedLines() });
    }
  }

  dispose() {
    this.clearStartTimer();
    this.acceptingMessages = false;
    this.send("quit");
    this.worker?.terminate();
    this.worker = null;
  }

  private ensureWorker() {
    if (this.worker) return;

    this.worker = new Worker(ENGINE_PATH);
    this.worker.onmessage = (event: MessageEvent<string>) => {
      this.handleMessage(String(event.data));
    };
    this.worker.onerror = (event) => {
      this.emitFallback(this.currentFen, event.message || "Stockfish worker failed");
    };
  }

  private send(command: string) {
    this.worker?.postMessage(command);
  }

  private handleMessage(message: string) {
    if (!this.acceptingMessages) return;

    const parsed = parseInfoLine(message, this.currentFen);
    if (parsed) {
      this.latestLines.set(parsed.multipv, parsed);
      this.onUpdate({ status: "analyzing", lines: this.sortedLines() });
      return;
    }

    if (message.startsWith("bestmove")) {
      const bestMove = message.split(/\s+/)[1];
      this.acceptingMessages = false;
      this.onUpdate({ status: "ready", lines: this.sortedLines(), bestMove });
    }
  }

  private sortedLines() {
    return [...this.latestLines.values()].sort((a, b) => a.multipv - b.multipv);
  }

  private emitFallback(fen: string, reason: string) {
    this.clearStartTimer();
    this.acceptingMessages = false;
    const lines = fallbackAnalysis(fen);
    this.onUpdate({
      status: "fallback",
      lines,
      bestMove: lines[0]?.uciMoves[0],
      message: reason
    });
  }

  private clearStartTimer() {
    if (this.startTimer === null) return;
    window.clearTimeout(this.startTimer);
    this.startTimer = null;
  }
}

export function parseInfoLine(line: string, fen: string): AnalysisLine | null {
  if (!line.startsWith("info ") || !line.includes(" pv ")) return null;

  const depth = Number(line.match(/\bdepth\s+(\d+)/)?.[1] || 0);
  const multipv = Number(line.match(/\bmultipv\s+(\d+)/)?.[1] || 1);
  const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
  const pv = line.match(/\bpv\s+(.+)$/)?.[1]?.trim().split(/\s+/) || [];

  if (!scoreMatch || pv.length === 0) return null;

  return {
    multipv,
    depth,
    score: {
      kind: scoreMatch[1] as "cp" | "mate",
      value: Number(scoreMatch[2])
    },
    uciMoves: pv,
    sanMoves: uciLineToSan(fen, pv)
  };
}

export function scoreLabel(score: EngineScore): string {
  if (score.kind === "mate") {
    return score.value > 0 ? `M${score.value}` : `-M${Math.abs(score.value)}`;
  }

  const pawns = score.value / 100;
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

export function fallbackAnalysis(fen: string): AnalysisLine[] {
  try {
    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true }) as Move[];
    const ranked = moves.sort((a, b) => scoreMove(b) - scoreMove(a)).slice(0, 3);

    return ranked.map((move, index) => {
      const next = new Chess(fen);
      const made = moveFromUci(next, `${move.from}${move.to}${move.promotion || ""}`);
      return {
        multipv: index + 1,
        depth: 1,
        score: { kind: "cp", value: scoreMove(move) * 10 },
        uciMoves: [`${move.from}${move.to}${move.promotion || ""}`],
        sanMoves: [made.san]
      };
    });
  } catch {
    return [];
  }
}

function scoreMove(move: Move): number {
  const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  let score = 0;

  if (move.captured) score += values[move.captured] * 10;
  if (move.promotion) score += values[move.promotion] * 8;
  if (move.san.includes("+")) score += 3;
  if (move.san.includes("#")) score += 100;

  return score;
}
