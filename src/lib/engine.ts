import { Chess } from "chess.js";

/** Engine score from the side to move's point of view (UCI convention). */
export type EngineScore = {
  kind: "cp" | "mate";
  /** Centipawns, or moves to mate. `mate 0` means the side to move is checkmated. */
  value: number;
};

export type UciInfo = {
  multipv: number;
  depth: number;
  score: EngineScore;
  /** Set when the score is only a bound (aspiration-window fail high/low). */
  bound?: "lower" | "upper";
  pv: string[];
  nodes?: number;
};

export type SearchLimits = {
  depth?: number;
  nodes?: number;
  movetimeMs?: number;
};

export type SearchRequest = {
  fen: string;
  multipv?: number;
  limits: SearchLimits;
  /** Called with the current lines (sorted by multipv) whenever the engine reports progress. */
  onInfo?: (lines: UciInfo[]) => void;
};

export type SearchResult = {
  fen: string;
  lines: UciInfo[];
  bestMove?: string;
  terminal?: "checkmate" | "stalemate";
  /** True when the search ended early: stopped, superseded by a newer search, or disposed. */
  stopped: boolean;
  /** How many engine crashes were recovered from while running this search. */
  restarts: number;
};

export type WorkerLike = {
  postMessage(message: string): void;
  terminate(): void;
  addEventListener(type: "message" | "error", listener: (event: { data?: unknown; message?: string }) => void): void;
};

export type UciEngineOptions = {
  createWorker: () => WorkerLike;
  /** First load fetches ~7 MB of WASM, so this is generous. */
  initTimeoutMs?: number;
  commandTimeoutMs?: number;
  /** How long `stop` may take before the worker is treated as hung and replaced. */
  stopTimeoutMs?: number;
  /** Crashes recovered per search before giving up. */
  maxRestarts?: number;
};

export class EngineError extends Error {
  constructor(
    message: string,
    readonly code: "crashed" | "timeout" | "load-failed" | "disposed"
  ) {
    super(message);
    this.name = "EngineError";
  }
}

type Waiter = {
  match: (line: string) => boolean;
  resolve: (line: string) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
};

type ActiveSearch = {
  lines: Map<number, UciInfo>;
  onInfo?: (lines: UciInfo[]) => void;
  stopSent: boolean;
  stopTimer?: ReturnType<typeof setTimeout>;
};

/**
 * Owns one Stockfish worker and talks UCI to it one search at a time.
 *
 * The single-threaded WASM build crashes if it receives a burst of commands
 * while it is still unwinding a search, so every search waits for the previous
 * one's `bestmove` before sending anything else. A newer `search()` supersedes
 * older ones: the running search is stopped and queued ones are skipped, and
 * both resolve with `stopped: true`. If the worker crashes it is replaced and
 * the current search is retried (up to `maxRestarts` times).
 */
export class UciEngine {
  private readonly createWorker: () => WorkerLike;
  private readonly initTimeoutMs: number;
  private readonly commandTimeoutMs: number;
  private readonly stopTimeoutMs: number;
  private readonly maxRestarts: number;

  private worker?: WorkerLike;
  private initPromise?: Promise<void>;
  private multipv = 1;
  private waiters = new Set<Waiter>();
  private active?: ActiveSearch;
  private queue: Promise<unknown> = Promise.resolve();
  private ticket = 0;
  /** Searches with a ticket at or below this were stopped before they finished. */
  private stoppedTicket = 0;
  private disposed = false;

  constructor(options: UciEngineOptions) {
    this.createWorker = options.createWorker;
    this.initTimeoutMs = options.initTimeoutMs ?? 30_000;
    this.commandTimeoutMs = options.commandTimeoutMs ?? 10_000;
    this.stopTimeoutMs = options.stopTimeoutMs ?? 3_000;
    this.maxRestarts = options.maxRestarts ?? 2;
  }

  search(request: SearchRequest): Promise<SearchResult> {
    if (this.disposed) return Promise.resolve(stoppedResult(request.fen, 0));

    this.stop();
    const ticket = ++this.ticket;

    const terminal = terminalState(request.fen);
    if (terminal) return Promise.resolve(terminalResult(request.fen, terminal));

    const run = this.queue.then(() => this.runSearch(request, ticket));
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Finish the running search now (it resolves with its partial lines) and
   * cancel any search still waiting to start, e.g. while the engine loads.
   */
  stop(): void {
    this.stoppedTicket = this.ticket;
    const search = this.active;
    if (!search || search.stopSent || !this.worker) return;
    search.stopSent = true;
    this.send("stop");
    search.stopTimer = setTimeout(() => {
      this.crash(new EngineError("Stockfish did not stop in time.", "timeout"));
    }, this.stopTimeoutMs);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ticket += 1;
    this.crash(new EngineError("The engine was disposed.", "disposed"));
  }

  private async runSearch(request: SearchRequest, ticket: number): Promise<SearchResult> {
    let restarts = 0;
    for (;;) {
      if (this.isStale(ticket)) return stoppedResult(request.fen, restarts);
      try {
        await this.ensureWorker();
        const result = await this.go(request, ticket);
        return { ...result, restarts };
      } catch (error) {
        if (this.isStale(ticket)) return stoppedResult(request.fen, restarts);
        if (!(error instanceof EngineError) || restarts >= this.maxRestarts) throw error;
        restarts += 1;
      }
    }
  }

  private async go(request: SearchRequest, ticket: number): Promise<Omit<SearchResult, "restarts">> {
    const multipv = Math.max(1, Math.trunc(request.multipv ?? 1));
    if (multipv !== this.multipv) {
      this.send(`setoption name MultiPV value ${multipv}`);
      await this.isReady(this.commandTimeoutMs);
      this.multipv = multipv;
    }
    if (this.isStale(ticket)) return stoppedResult(request.fen, 0);

    const search: ActiveSearch = { lines: new Map(), onInfo: request.onInfo, stopSent: false };
    this.active = search;
    const bestMoveLine = this.waitForLine((line) => line.startsWith("bestmove"));
    this.send(`position fen ${request.fen}`);
    this.send(goCommand(request.limits));

    try {
      const line = await bestMoveLine;
      const bestMove = line.split(/\s+/)[1];
      return {
        fen: request.fen,
        lines: sortedLines(search.lines),
        ...(bestMove && bestMove !== "(none)" ? { bestMove } : {}),
        stopped: search.stopSent
      };
    } catch (error) {
      // A stop that turned into a crash/timeout still has useful partial lines.
      if (search.stopSent) {
        return { fen: request.fen, lines: sortedLines(search.lines), stopped: true };
      }
      throw error;
    } finally {
      if (search.stopTimer) clearTimeout(search.stopTimer);
      if (this.active === search) this.active = undefined;
    }
  }

  private ensureWorker(): Promise<void> {
    if (this.worker && this.initPromise) return this.initPromise;

    let worker: WorkerLike;
    try {
      worker = this.createWorker();
    } catch (error) {
      return Promise.reject(
        new EngineError(error instanceof Error ? error.message : "Could not start Stockfish.", "load-failed")
      );
    }

    this.worker = worker;
    this.multipv = 1;
    worker.addEventListener("message", (event) => {
      if (this.worker !== worker) return;
      for (const line of splitLines(event.data)) this.handleLine(line);
    });
    worker.addEventListener("error", (event) => {
      if (this.worker !== worker) return;
      this.crash(new EngineError(event.message || "Stockfish crashed.", "crashed"));
    });

    const init = (async () => {
      const uciOk = this.waitForLine((line) => line === "uciok", this.initTimeoutMs);
      this.send("uci");
      await uciOk;
      await this.isReady(this.initTimeoutMs);
    })();
    this.initPromise = init;
    return init;
  }

  private isReady(timeoutMs: number): Promise<string> {
    const ready = this.waitForLine((line) => line === "readyok", timeoutMs);
    this.send("isready");
    return ready;
  }

  private handleLine(line: string): void {
    const search = this.active;
    if (search) {
      const info = parseUciInfo(line);
      if (info) {
        const previous = search.lines.get(info.multipv);
        // Keep the last exact score rather than replacing it with a bound.
        if (!(info.bound && previous && !previous.bound)) {
          search.lines.set(info.multipv, info);
          search.onInfo?.(sortedLines(search.lines));
        }
        return;
      }
    }

    for (const waiter of [...this.waiters]) {
      if (!waiter.match(line)) continue;
      if (waiter.timer) clearTimeout(waiter.timer);
      this.waiters.delete(waiter);
      waiter.resolve(line);
    }
  }

  private waitForLine(match: (line: string) => boolean, timeoutMs?: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { match, resolve, reject };
      if (timeoutMs !== undefined) {
        waiter.timer = setTimeout(() => {
          this.crash(new EngineError("Stockfish did not respond in time.", "timeout"));
        }, timeoutMs);
      }
      this.waiters.add(waiter);
    });
  }

  /** Tear the worker down and fail everything waiting on it; the next search starts a fresh one. */
  private crash(error: EngineError): void {
    const worker = this.worker;
    this.worker = undefined;
    this.initPromise = undefined;
    this.multipv = 1;
    if (this.active?.stopTimer) clearTimeout(this.active.stopTimer);
    worker?.terminate();

    const waiters = [...this.waiters];
    this.waiters.clear();
    for (const waiter of waiters) {
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  private send(command: string): void {
    if (!this.worker) throw new EngineError("Stockfish is not running.", "crashed");
    this.worker.postMessage(command);
  }

  private isStale(ticket: number): boolean {
    return this.disposed || ticket !== this.ticket || ticket <= this.stoppedTicket;
  }
}

export function parseUciInfo(line: string): UciInfo | null {
  if (!line.startsWith("info ") || line.startsWith("info string")) return null;

  const tokens = line.trim().split(/\s+/);
  const depth = numberAfter(tokens, "depth");
  const scoreIndex = tokens.indexOf("score");
  if (depth === undefined || scoreIndex < 0) return null;

  const kind = tokens[scoreIndex + 1];
  const value = Number(tokens[scoreIndex + 2]);
  if ((kind !== "cp" && kind !== "mate") || !Number.isFinite(value)) return null;

  const boundToken = tokens[scoreIndex + 3];
  const bound = boundToken === "lowerbound" ? "lower" : boundToken === "upperbound" ? "upper" : undefined;
  const pvIndex = tokens.indexOf("pv");
  const nodes = numberAfter(tokens, "nodes");

  return {
    multipv: numberAfter(tokens, "multipv") ?? 1,
    depth,
    score: { kind, value },
    ...(bound ? { bound } : {}),
    pv: pvIndex >= 0 ? tokens.slice(pvIndex + 1) : [],
    ...(nodes !== undefined ? { nodes } : {})
  };
}

/** Positions the engine has nothing to search in; answered locally instead. */
export function terminalState(fen: string): "checkmate" | "stalemate" | null {
  try {
    const chess = new Chess(fen);
    if (chess.isCheckmate()) return "checkmate";
    if (chess.isStalemate()) return "stalemate";
  } catch {
    /* invalid FEN: let the caller's validation report it */
  }
  return null;
}

function terminalResult(fen: string, terminal: "checkmate" | "stalemate"): SearchResult {
  const score: EngineScore = terminal === "checkmate" ? { kind: "mate", value: 0 } : { kind: "cp", value: 0 };
  return { fen, lines: [{ multipv: 1, depth: 0, score, pv: [] }], terminal, stopped: false, restarts: 0 };
}

function stoppedResult(fen: string, restarts: number): SearchResult {
  return { fen, lines: [], stopped: true, restarts };
}

function goCommand(limits: SearchLimits): string {
  const parts = ["go"];
  if (limits.depth !== undefined) parts.push("depth", String(Math.max(1, Math.trunc(limits.depth))));
  if (limits.nodes !== undefined) parts.push("nodes", String(Math.max(1, Math.trunc(limits.nodes))));
  if (limits.movetimeMs !== undefined) parts.push("movetime", String(Math.max(1, Math.trunc(limits.movetimeMs))));
  return parts.length > 1 ? parts.join(" ") : "go depth 16";
}

function sortedLines(lines: Map<number, UciInfo>): UciInfo[] {
  return [...lines.values()].sort((a, b) => a.multipv - b.multipv);
}

function splitLines(data: unknown): string[] {
  return String(data ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function numberAfter(tokens: string[], key: string): number | undefined {
  const index = tokens.indexOf(key);
  if (index < 0) return undefined;
  const value = Number(tokens[index + 1]);
  return Number.isFinite(value) ? value : undefined;
}
