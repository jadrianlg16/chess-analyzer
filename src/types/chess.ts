declare const fenBrand: unique symbol;
declare const pgnBrand: unique symbol;

export type FenString = string & { readonly [fenBrand]: true };
export type PgnString = string & { readonly [pgnBrand]: true };

export type FenSide = "w" | "b";
export type ChessColor = "white" | "black";
export type FenPiece =
  | "p"
  | "n"
  | "b"
  | "r"
  | "q"
  | "k"
  | "P"
  | "N"
  | "B"
  | "R"
  | "Q"
  | "K";

export interface ParsedFen {
  readonly normalized: FenString;
  readonly placement: string;
  readonly activeColor: FenSide;
  readonly castling: string;
  readonly enPassant: string;
  readonly halfmoveClock: number;
  readonly fullmoveNumber: number;
  readonly ranks: ReadonlyArray<ReadonlyArray<FenPiece | null>>;
}

export interface PositionValidation {
  readonly ok: boolean;
  readonly source: "lightweight" | "chess.js";
  readonly normalized?: FenString;
  readonly parsed?: ParsedFen;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export interface ChessMove {
  readonly san?: string;
  readonly lan?: string;
  readonly from?: string;
  readonly to?: string;
  readonly promotion?: string;
  readonly color?: FenSide;
  readonly piece?: string;
  readonly captured?: string;
  readonly flags?: string;
  readonly before?: FenString;
  readonly after?: FenString;
}

export interface PgnLoadResult {
  readonly ok: boolean;
  readonly pgn: PgnString;
  readonly finalFen?: FenString;
  readonly moves: readonly ChessMove[];
  readonly headers?: Readonly<Record<string, string>>;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export interface MoveApplicationResult {
  readonly ok: boolean;
  readonly initialFen: FenString;
  readonly finalFen?: FenString;
  readonly moves: readonly ChessMove[];
  readonly errors: readonly string[];
}

export interface ChessRulesAdapter {
  validateFen(fen: string): PositionValidation;
  normalizeFen(fen: string): FenString;
  legalMoves(fen: string): readonly ChessMove[];
  loadPgn(pgn: string): PgnLoadResult;
  applyMoves(fen: string, moves: readonly string[]): MoveApplicationResult;
}

export type EngineState =
  | "idle"
  | "loading"
  | "ready"
  | "analyzing"
  | "stopped"
  | "unavailable"
  | "error"
  | "disposed";

export type EngineScore =
  | {
      readonly type: "cp";
      readonly cp: number;
      readonly bound?: "lower" | "upper";
      readonly raw: string;
    }
  | {
      readonly type: "mate";
      readonly moves: number;
      readonly bound?: "lower" | "upper";
      readonly raw: string;
    };

export interface PrincipalVariation {
  readonly multipv: number;
  readonly depth: number;
  readonly selectiveDepth?: number;
  readonly score: EngineScore;
  readonly pv: readonly string[];
  readonly nodes?: number;
  readonly nps?: number;
  readonly hashfull?: number;
  readonly tbhits?: number;
  readonly timeMs?: number;
  readonly raw: string;
}

export type EngineErrorCode =
  | "engine-unavailable"
  | "engine-load-failed"
  | "engine-timeout"
  | "invalid-position"
  | "uci-error"
  | "disposed"
  | "unknown";

export interface EngineError {
  readonly code: EngineErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export interface AnalysisSnapshot {
  readonly fen: FenString;
  readonly state: EngineState;
  readonly lines: readonly PrincipalVariation[];
  readonly bestMove?: string;
  readonly ponder?: string;
  readonly error?: EngineError;
  readonly raw?: string;
  readonly timestamp: number;
}

export interface AnalysisOptions {
  readonly fen?: FenString | string;
  readonly moves?: readonly string[];
  readonly multipv?: number;
  readonly depth?: number;
  readonly movetimeMs?: number;
  readonly infinite?: boolean;
  readonly threads?: number;
  readonly hashMb?: number;
  readonly skillLevel?: number;
}

export type AnalysisListener = (snapshot: AnalysisSnapshot) => void;
export type Unsubscribe = () => void;

export interface EngineAdapter {
  readonly name: string;
  getState(): EngineState;
  onUpdate(listener: AnalysisListener): Unsubscribe;
  setPosition(fen: FenString | string, moves?: readonly string[]): Promise<void>;
  setMultiPV(lines: number): Promise<void>;
  setDepth(depth?: number): Promise<void>;
  start(options?: AnalysisOptions): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}

export interface StockfishWorkerLike {
  postMessage(message: string): void;
  terminate?: () => void;
  addEventListener?: Worker["addEventListener"];
  removeEventListener?: Worker["removeEventListener"];
  onmessage?: Worker["onmessage"];
  onerror?: Worker["onerror"];
}

export type StockfishWorkerFactory = () =>
  | StockfishWorkerLike
  | Promise<StockfishWorkerLike>;

export interface StockfishAdapterConfig {
  readonly name?: string;
  readonly createWorker?: StockfishWorkerFactory;
  readonly workerUrl?: string | URL;
  readonly workerOptions?: WorkerOptions;
  readonly defaultOptions?: AnalysisOptions;
  readonly initTimeoutMs?: number;
  readonly commandTimeoutMs?: number;
  readonly fallbackToUnavailable?: boolean;
}
