import {
  STARTING_FEN,
  getFenSideToMove,
  unsafeFen,
  validateFenLightweight,
} from "./chessDomain";
import type {
  AnalysisListener,
  AnalysisOptions,
  AnalysisSnapshot,
  EngineAdapter,
  EngineError,
  EngineScore,
  EngineState,
  FenSide,
  FenString,
  PrincipalVariation,
  StockfishAdapterConfig,
  StockfishWorkerLike,
  Unsubscribe,
} from "../types/chess";

type Waiter = {
  predicate: (line: string) => boolean;
  resolve: (line: string) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

export interface BestMoveResult {
  readonly bestMove?: string;
  readonly ponder?: string;
  readonly raw: string;
}

const DEFAULT_INIT_TIMEOUT_MS = 10_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 5_000;
const DEFAULT_DEPTH = 16;
export const DEFAULT_STOCKFISH_WORKER_URL = `${import.meta.env.BASE_URL}vendor/stockfish/stockfish-18-lite-single.js`;

export function createStockfishEngineAdapter(
  config: StockfishAdapterConfig = {},
): EngineAdapter {
  const resolvedConfig = resolveStockfishConfig(config);

  if (
    !canAttemptStockfishLoad(resolvedConfig) &&
    config.fallbackToUnavailable !== false
  ) {
    return new UnavailableEngineAdapter(
      config.name ?? "Stockfish unavailable",
      "No Stockfish Worker factory or workerUrl was configured.",
    );
  }

  return new StockfishEngineAdapter(resolvedConfig);
}

export function createStockfishWorkerFromUrl(
  workerUrl: string | URL,
  workerOptions?: WorkerOptions,
): StockfishWorkerLike {
  if (typeof Worker === "undefined") {
    throw new Error("Web Workers are not available in this runtime.");
  }

  return new Worker(workerUrl, workerOptions);
}

export function parseStockfishInfoLine(
  line: string,
): PrincipalVariation | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("info ")) {
    return undefined;
  }

  const tokens = trimmed.split(/\s+/);
  const depth = numberAfter(tokens, "depth");
  const score = parseScore(tokens);

  if (depth === undefined || !score) {
    return undefined;
  }

  const pvIndex = tokens.indexOf("pv");
  const pv = pvIndex >= 0 ? tokens.slice(pvIndex + 1) : [];

  return {
    multipv: numberAfter(tokens, "multipv") ?? 1,
    depth,
    selectiveDepth: numberAfter(tokens, "seldepth"),
    score,
    pv,
    nodes: numberAfter(tokens, "nodes"),
    nps: numberAfter(tokens, "nps"),
    hashfull: numberAfter(tokens, "hashfull"),
    tbhits: numberAfter(tokens, "tbhits"),
    timeMs: numberAfter(tokens, "time"),
    raw: trimmed,
  };
}

export function parseBestMoveLine(line: string): BestMoveResult | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("bestmove ")) {
    return undefined;
  }

  const tokens = trimmed.split(/\s+/);
  const bestMove = tokens[1] && tokens[1] !== "(none)" ? tokens[1] : undefined;
  const ponderIndex = tokens.indexOf("ponder");
  const ponder =
    ponderIndex >= 0 && tokens[ponderIndex + 1]
      ? tokens[ponderIndex + 1]
      : undefined;

  return {
    ...(bestMove ? { bestMove } : {}),
    ...(ponder ? { ponder } : {}),
    raw: trimmed,
  };
}

export function scoreToWhitePerspective(
  score: EngineScore,
  sideToMove: FenSide,
): EngineScore {
  const multiplier = sideToMove === "w" ? 1 : -1;

  if (score.type === "cp") {
    return {
      ...score,
      cp: score.cp * multiplier,
    };
  }

  return {
    ...score,
    moves: score.moves * multiplier,
  };
}

export function scoreToWhiteCentipawns(
  score: EngineScore,
  sideToMove: FenSide,
): number | undefined {
  if (score.type !== "cp") {
    return undefined;
  }

  return score.cp * (sideToMove === "w" ? 1 : -1);
}

export class StockfishEngineAdapter implements EngineAdapter {
  readonly name: string;

  private readonly config: StockfishAdapterConfig;
  private readonly listeners = new Set<AnalysisListener>();
  private readonly waiters = new Set<Waiter>();
  private worker?: StockfishWorkerLike;
  private state: EngineState = "idle";
  private options: AnalysisOptions;
  private currentFen: FenString;
  private currentMoves: string[];
  private lines = new Map<number, PrincipalVariation>();
  private bestMove?: string;
  private ponder?: string;

  constructor(config: StockfishAdapterConfig = {}) {
    this.config = config;
    this.name = config.name ?? "Stockfish";
    this.options = normalizeOptions(config.defaultOptions ?? {});
    this.currentFen = unsafeFen(this.options.fen ?? STARTING_FEN);
    this.currentMoves = [...(this.options.moves ?? [])];
  }

  getState(): EngineState {
    return this.state;
  }

  onUpdate(listener: AnalysisListener): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async setPosition(
    fen: FenString | string,
    moves: readonly string[] = [],
  ): Promise<void> {
    this.assertNotDisposed();

    const validation = validateFenLightweight(fen);
    if (!validation.ok || !validation.normalized) {
      const error = engineError(
        "invalid-position",
        validation.errors.join(" ") || "Invalid FEN.",
      );
      this.emitSnapshot(error);
      throw new Error(error.message);
    }

    if (this.state === "analyzing") {
      await this.stop();
    }

    this.currentFen = validation.normalized;
    this.currentMoves = [...moves];
    this.lines = new Map();
    this.bestMove = undefined;
    this.ponder = undefined;
    this.options = {
      ...this.options,
      fen: this.currentFen,
      moves: this.currentMoves,
    };

    if (this.worker) {
      this.sendPosition();
    }

    this.emitSnapshot();
  }

  async setMultiPV(lines: number): Promise<void> {
    this.assertNotDisposed();
    const multipv = clampPositiveInteger(lines, 1);
    this.options = {
      ...this.options,
      multipv,
    };

    if (this.worker) {
      this.send(`setoption name MultiPV value ${multipv}`);
      await this.waitUntilReady();
    }
  }

  async setDepth(depth?: number): Promise<void> {
    this.assertNotDisposed();
    this.options = {
      ...this.options,
      depth: depth === undefined ? undefined : clampPositiveInteger(depth, 1),
    };
  }

  async start(options: AnalysisOptions = {}): Promise<void> {
    this.assertNotDisposed();

    if (this.state === "analyzing") {
      await this.stop();
    }

    this.options = normalizeOptions({
      ...this.options,
      ...options,
    });

    if (options.fen || options.moves) {
      await this.setPosition(options.fen ?? this.currentFen, options.moves ?? []);
    }

    await this.ensureReady();
    await this.configureEngine(this.options);

    this.lines = new Map();
    this.bestMove = undefined;
    this.ponder = undefined;
    this.send("ucinewgame");
    await this.waitUntilReady();
    this.sendPosition();
    this.setState("analyzing");
    this.send(buildGoCommand(this.options));
  }

  async stop(): Promise<void> {
    this.assertNotDisposed();

    if (this.state !== "analyzing" || !this.worker) {
      this.setState(this.worker ? "ready" : "stopped");
      return;
    }

    const bestMovePromise = this.waitForLine(
      (line) => line.startsWith("bestmove "),
      this.commandTimeoutMs(),
      "Timed out waiting for Stockfish to stop analysis.",
    );
    this.send("stop");

    try {
      await bestMovePromise;
    } catch (cause) {
      this.emitSnapshot(
        engineError(
          "engine-timeout",
          errorMessage(cause, "Timed out waiting for Stockfish to stop analysis."),
          cause,
        ),
      );
      this.setState("ready");
    }
  }

  async dispose(): Promise<void> {
    if (this.state === "disposed") {
      return;
    }

    if (this.state === "analyzing") {
      await this.stop().catch(() => undefined);
    }

    this.rejectWaiters(new Error("Stockfish adapter was disposed."));
    this.unbindWorker();
    this.worker?.terminate?.();
    this.worker = undefined;
    this.setState("disposed");
  }

  private async ensureReady(): Promise<void> {
    if (this.worker && (this.state === "ready" || this.state === "stopped")) {
      this.setState("ready");
      return;
    }
    if (this.worker && this.state === "analyzing") {
      return;
    }

    this.setState("loading");

    try {
      this.worker = await this.createWorker();
      this.bindWorker();
      this.send("uci");
      await this.waitForLine(
        (line) => line === "uciok",
        this.initTimeoutMs(),
        "Timed out waiting for Stockfish UCI initialization.",
      );
      await this.configureEngine(this.options);
      await this.waitUntilReady();
      this.setState("ready");
    } catch (cause) {
      this.unbindWorker();
      this.worker?.terminate?.();
      this.worker = undefined;
      const error = engineError(
        "engine-load-failed",
        errorMessage(cause, "Failed to load Stockfish."),
        cause,
      );
      this.setState("error");
      this.emitSnapshot(error);
      throw new Error(error.message);
    }
  }

  private async createWorker(): Promise<StockfishWorkerLike> {
    if (this.config.createWorker) {
      return this.config.createWorker();
    }

    if (this.config.workerUrl) {
      return createStockfishWorkerFromUrl(
        this.config.workerUrl,
        this.config.workerOptions,
      );
    }

    const globalFactory = getGlobalStockfishFactory();
    if (globalFactory) {
      return globalFactory();
    }

    throw new Error("No Stockfish Worker factory or workerUrl was configured.");
  }

  private async configureEngine(options: AnalysisOptions): Promise<void> {
    const multipv = clampPositiveInteger(options.multipv ?? 1, 1);
    this.send(`setoption name MultiPV value ${multipv}`);

    if (options.threads !== undefined) {
      this.send(`setoption name Threads value ${clampPositiveInteger(options.threads, 1)}`);
    }
    if (options.hashMb !== undefined) {
      this.send(`setoption name Hash value ${clampPositiveInteger(options.hashMb, 1)}`);
    }
    if (options.skillLevel !== undefined) {
      this.send(
        `setoption name Skill Level value ${clampInteger(options.skillLevel, 0, 20)}`,
      );
    }

    await this.waitUntilReady();
  }

  private sendPosition(): void {
    const moves =
      this.currentMoves.length > 0 ? ` moves ${this.currentMoves.join(" ")}` : "";
    this.send(`position fen ${this.currentFen}${moves}`);
  }

  private async waitUntilReady(): Promise<void> {
    this.send("isready");
    await this.waitForLine(
      (line) => line === "readyok",
      this.commandTimeoutMs(),
      "Timed out waiting for Stockfish readyok.",
    );
  }

  private waitForLine(
    predicate: (line: string) => boolean,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        predicate,
        resolve,
        reject,
        timeoutId: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new Error(timeoutMessage));
        }, timeoutMs),
      };

      this.waiters.add(waiter);
    });
  }

  private bindWorker(): void {
    if (!this.worker) {
      return;
    }

    if (this.worker.addEventListener) {
      this.worker.addEventListener("message", this.handleWorkerMessage as EventListener);
      this.worker.addEventListener("error", this.handleWorkerError as EventListener);
      return;
    }

    this.worker.onmessage = this.handleWorkerMessage as Worker["onmessage"];
    this.worker.onerror = this.handleWorkerError as Worker["onerror"];
  }

  private unbindWorker(): void {
    if (!this.worker) {
      return;
    }

    if (this.worker.removeEventListener) {
      this.worker.removeEventListener(
        "message",
        this.handleWorkerMessage as EventListener,
      );
      this.worker.removeEventListener("error", this.handleWorkerError as EventListener);
      return;
    }

    this.worker.onmessage = null;
    this.worker.onerror = null;
  }

  private readonly handleWorkerMessage = (event: MessageEvent | { data?: unknown }) => {
    const payload = "data" in event ? event.data : event;
    const lines = normalizeWorkerPayload(payload);
    for (const line of lines) {
      this.handleLine(line);
    }
  };

  private readonly handleWorkerError = (event: Event | ErrorEvent | unknown) => {
    const message =
      event instanceof ErrorEvent && event.message
        ? event.message
        : "Stockfish Worker emitted an error.";
    this.setState("error");
    this.emitSnapshot(engineError("uci-error", message, event));
  };

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    this.resolveWaiters(trimmed);

    const info = parseStockfishInfoLine(trimmed);
    if (info) {
      this.lines.set(info.multipv, info);
      this.emitSnapshot(undefined, trimmed);
      return;
    }

    const bestMove = parseBestMoveLine(trimmed);
    if (bestMove) {
      this.bestMove = bestMove.bestMove;
      this.ponder = bestMove.ponder;
      if (this.state === "analyzing") {
        this.setState("ready", false);
      }
      this.emitSnapshot(undefined, trimmed);
    }
  }

  private resolveWaiters(line: string): void {
    for (const waiter of [...this.waiters]) {
      if (!waiter.predicate(line)) {
        continue;
      }

      clearTimeout(waiter.timeoutId);
      this.waiters.delete(waiter);
      waiter.resolve(line);
    }
  }

  private rejectWaiters(error: Error): void {
    for (const waiter of [...this.waiters]) {
      clearTimeout(waiter.timeoutId);
      this.waiters.delete(waiter);
      waiter.reject(error);
    }
  }

  private send(command: string): void {
    if (!this.worker) {
      throw new Error("Stockfish Worker is not ready.");
    }

    this.worker.postMessage(command);
  }

  private setState(nextState: EngineState, emit = true): void {
    this.state = nextState;
    if (emit) {
      this.emitSnapshot();
    }
  }

  private emitSnapshot(error?: EngineError, raw?: string): void {
    const snapshot = createSnapshot({
      fen: this.currentFen,
      state: this.state,
      lines: [...this.lines.values()].sort((a, b) => a.multipv - b.multipv),
      bestMove: this.bestMove,
      ponder: this.ponder,
      error,
      raw,
    });

    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private assertNotDisposed(): void {
    if (this.state === "disposed") {
      throw new Error("Stockfish adapter has been disposed.");
    }
  }

  private initTimeoutMs(): number {
    return this.config.initTimeoutMs ?? DEFAULT_INIT_TIMEOUT_MS;
  }

  private commandTimeoutMs(): number {
    return this.config.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  }
}

export class UnavailableEngineAdapter implements EngineAdapter {
  readonly name: string;

  private readonly reason: string;
  private readonly listeners = new Set<AnalysisListener>();
  private state: EngineState = "unavailable";
  private currentFen = STARTING_FEN;

  constructor(name = "Engine unavailable", reason = "Stockfish is not available.") {
    this.name = name;
    this.reason = reason;
  }

  getState(): EngineState {
    return this.state;
  }

  onUpdate(listener: AnalysisListener): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async setPosition(fen: FenString | string): Promise<void> {
    const validation = validateFenLightweight(fen);
    if (!validation.ok || !validation.normalized) {
      const error = engineError(
        "invalid-position",
        validation.errors.join(" ") || "Invalid FEN.",
      );
      this.emitSnapshot(error);
      throw new Error(error.message);
    }

    this.currentFen = validation.normalized;
    this.emitSnapshot();
  }

  async setMultiPV(): Promise<void> {
    this.emitSnapshot();
  }

  async setDepth(): Promise<void> {
    this.emitSnapshot();
  }

  async start(options: AnalysisOptions = {}): Promise<void> {
    if (options.fen) {
      await this.setPosition(options.fen);
    }

    this.state = "unavailable";
    this.emitSnapshot(
      engineError("engine-unavailable", this.reason),
    );
  }

  async stop(): Promise<void> {
    this.emitSnapshot();
  }

  async dispose(): Promise<void> {
    this.state = "disposed";
    this.emitSnapshot();
  }

  private emitSnapshot(error?: EngineError): void {
    const snapshot = createSnapshot({
      fen: this.currentFen,
      state: this.state,
      lines: [],
      error,
    });

    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

function buildGoCommand(options: AnalysisOptions): string {
  if (options.movetimeMs !== undefined) {
    return `go movetime ${clampPositiveInteger(options.movetimeMs, 1)}`;
  }

  if (options.depth !== undefined) {
    return `go depth ${clampPositiveInteger(options.depth, 1)}`;
  }

  if (options.infinite === false) {
    return `go depth ${DEFAULT_DEPTH}`;
  }

  return "go infinite";
}

function parseScore(tokens: readonly string[]): EngineScore | undefined {
  const scoreIndex = tokens.indexOf("score");
  if (scoreIndex < 0) {
    return undefined;
  }

  const scoreType = tokens[scoreIndex + 1];
  const rawValue = Number(tokens[scoreIndex + 2]);
  if (!Number.isFinite(rawValue)) {
    return undefined;
  }

  const pvIndex = tokens.indexOf("pv");
  const scoreTokens = tokens.slice(
    scoreIndex,
    pvIndex >= 0 ? pvIndex : tokens.length,
  );
  const bound = scoreTokens.includes("lowerbound")
    ? "lower"
    : scoreTokens.includes("upperbound")
      ? "upper"
      : undefined;
  const raw = scoreTokens.join(" ");

  if (scoreType === "cp") {
    return {
      type: "cp",
      cp: rawValue,
      ...(bound ? { bound } : {}),
      raw,
    };
  }

  if (scoreType === "mate") {
    return {
      type: "mate",
      moves: rawValue,
      ...(bound ? { bound } : {}),
      raw,
    };
  }

  return undefined;
}

function numberAfter(tokens: readonly string[], key: string): number | undefined {
  const index = tokens.indexOf(key);
  if (index < 0) {
    return undefined;
  }

  const value = Number(tokens[index + 1]);
  return Number.isFinite(value) ? value : undefined;
}

function normalizeWorkerPayload(payload: unknown): string[] {
  if (typeof payload === "string") {
    return payload.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }

  if (payload instanceof Uint8Array) {
    const decoded = new TextDecoder().decode(payload);
    return decoded.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }

  return [];
}

function normalizeOptions(options: AnalysisOptions): AnalysisOptions {
  return {
    ...options,
    ...(options.multipv !== undefined
      ? { multipv: clampPositiveInteger(options.multipv, 1) }
      : {}),
    ...(options.depth !== undefined
      ? { depth: clampPositiveInteger(options.depth, 1) }
      : {}),
    ...(options.movetimeMs !== undefined
      ? { movetimeMs: clampPositiveInteger(options.movetimeMs, 1) }
      : {}),
    ...(options.threads !== undefined
      ? { threads: clampPositiveInteger(options.threads, 1) }
      : {}),
    ...(options.hashMb !== undefined
      ? { hashMb: clampPositiveInteger(options.hashMb, 1) }
      : {}),
    ...(options.skillLevel !== undefined
      ? { skillLevel: clampInteger(options.skillLevel, 0, 20) }
      : {}),
  };
}

function createSnapshot(input: {
  fen: FenString;
  state: EngineState;
  lines: readonly PrincipalVariation[];
  bestMove?: string;
  ponder?: string;
  error?: EngineError;
  raw?: string;
}): AnalysisSnapshot {
  return {
    fen: input.fen,
    state: input.state,
    lines: input.lines,
    timestamp: Date.now(),
    ...(input.bestMove ? { bestMove: input.bestMove } : {}),
    ...(input.ponder ? { ponder: input.ponder } : {}),
    ...(input.error ? { error: input.error } : {}),
    ...(input.raw ? { raw: input.raw } : {}),
  };
}

function canAttemptStockfishLoad(config: StockfishAdapterConfig): boolean {
  return Boolean(
    config.createWorker ||
      config.workerUrl ||
      getGlobalStockfishFactory(),
  );
}

function resolveStockfishConfig(
  config: StockfishAdapterConfig,
): StockfishAdapterConfig {
  if (config.createWorker || config.workerUrl || getGlobalStockfishFactory()) {
    return config;
  }

  if (typeof Worker === "undefined") {
    return config;
  }

  return {
    ...config,
    workerUrl: DEFAULT_STOCKFISH_WORKER_URL,
  };
}

function getGlobalStockfishFactory():
  | (() => StockfishWorkerLike | Promise<StockfishWorkerLike>)
  | undefined {
  const globalValue = globalThis as typeof globalThis & {
    Stockfish?: unknown;
    STOCKFISH?: unknown;
  };
  const candidate = globalValue.Stockfish ?? globalValue.STOCKFISH;
  return typeof candidate === "function"
    ? (candidate as () => StockfishWorkerLike | Promise<StockfishWorkerLike>)
    : undefined;
}

function engineError(
  code: EngineError["code"],
  message: string,
  cause?: unknown,
): EngineError {
  return {
    code,
    message,
    ...(cause !== undefined ? { cause } : {}),
  };
}

function clampPositiveInteger(value: number, minimum: number): number {
  return Math.max(minimum, Math.trunc(value));
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export function whitePerspectiveForFen(
  score: EngineScore,
  fen: FenString | string,
): EngineScore {
  return scoreToWhitePerspective(score, getFenSideToMove(fen) ?? "w");
}
