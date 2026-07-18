import type {
  ChessMove,
  ChessRulesAdapter,
  FenPiece,
  FenSide,
  FenString,
  MoveApplicationResult,
  ParsedFen,
  PgnLoadResult,
  PgnString,
  PositionValidation,
} from "../types/chess";

export const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" as FenString;

const FEN_PIECES = new Set<string>([
  "p",
  "n",
  "b",
  "r",
  "q",
  "k",
  "P",
  "N",
  "B",
  "R",
  "Q",
  "K",
]);

export interface ChessJsInstance {
  fen(): string;
  pgn?: () => string;
  moves?: (options?: unknown) => unknown[];
  history?: (options?: unknown) => unknown[];
  move?: (move: unknown, options?: unknown) => unknown;
  load?: (fen: string) => boolean | void;
  loadPgn?: (pgn: string, options?: unknown) => boolean | void;
  load_pgn?: (pgn: string, options?: unknown) => boolean | void;
  header?: (...args: unknown[]) => unknown;
  getHeaders?: () => unknown;
}

export type ChessJsConstructor = new (fen?: string) => ChessJsInstance;

export type ChessJsValidateFen = (
  fen: string,
) =>
  | boolean
  | {
      ok?: boolean;
      valid?: boolean;
      error?: string;
      message?: string;
    };

export interface ChessJsRulesOptions {
  readonly Chess: ChessJsConstructor;
  readonly validateFen?: ChessJsValidateFen;
  readonly pgnLoadOptions?: unknown;
}

export function normalizeFenInput(fen: string): string {
  return fen.trim().replace(/\s+/g, " ");
}

export function unsafeFen(fen: string): FenString {
  return normalizeFenInput(fen) as FenString;
}

export function unsafePgn(pgn: string): PgnString {
  return pgn.trim() as PgnString;
}

export function validateFenLightweight(fen: string): PositionValidation {
  const normalized = normalizeFenInput(fen);
  const errors: string[] = [];
  const warnings: string[] = [];
  const fields = normalized.split(" ");

  if (fields.length !== 6) {
    errors.push(
      `FEN must contain 6 fields, received ${fields.length || 0}.`,
    );
    return {
      ok: false,
      source: "lightweight",
      errors,
      warnings,
    };
  }

  const [placement, activeColor, castling, enPassant, halfmove, fullmove] =
    fields;
  const ranks = parsePlacement(placement, errors);

  if (activeColor !== "w" && activeColor !== "b") {
    errors.push("FEN active color must be 'w' or 'b'.");
  }

  validateCastling(castling, ranks, errors, warnings);
  validateEnPassant(enPassant, activeColor, errors, warnings);

  const halfmoveClock = parseIntegerField(
    halfmove,
    "halfmove clock",
    0,
    errors,
  );
  const fullmoveNumber = parseIntegerField(
    fullmove,
    "fullmove number",
    1,
    errors,
  );

  const whiteKings = countPiece(ranks, "K");
  const blackKings = countPiece(ranks, "k");
  if (whiteKings !== 1) {
    errors.push(`FEN must contain exactly one white king, found ${whiteKings}.`);
  }
  if (blackKings !== 1) {
    errors.push(`FEN must contain exactly one black king, found ${blackKings}.`);
  }

  if (errors.length > 0) {
    return {
      ok: false,
      source: "lightweight",
      errors,
      warnings,
    };
  }

  const parsed: ParsedFen = {
    normalized: normalized as FenString,
    placement,
    activeColor: activeColor as FenSide,
    castling,
    enPassant,
    halfmoveClock,
    fullmoveNumber,
    ranks,
  };

  return {
    ok: true,
    source: "lightweight",
    normalized: parsed.normalized,
    parsed,
    errors,
    warnings,
  };
}

export function assertValidFen(fen: string): FenString {
  const validation = validateFenLightweight(fen);
  if (!validation.ok || !validation.normalized) {
    throw new Error(validation.errors.join(" ") || "Invalid FEN.");
  }

  return validation.normalized;
}

export function getFenSideToMove(fen: string): FenSide | undefined {
  const fields = normalizeFenInput(fen).split(" ");
  return fields[1] === "w" || fields[1] === "b" ? fields[1] : undefined;
}

export function fenSideToColor(side: FenSide): "white" | "black" {
  return side === "w" ? "white" : "black";
}

export function createLightweightChessRules(): ChessRulesAdapter {
  return {
    validateFen: validateFenLightweight,
    normalizeFen: assertValidFen,
    legalMoves: () => [],
    loadPgn: (pgn: string): PgnLoadResult => ({
      ok: false,
      pgn: unsafePgn(pgn),
      moves: [],
      errors: ["PGN parsing requires chess.js to be wired into the adapter."],
      warnings: [],
    }),
    applyMoves: (fen: string, moves: readonly string[]): MoveApplicationResult => {
      const validation = validateFenLightweight(fen);
      const initialFen = validation.normalized ?? unsafeFen(fen);

      if (!validation.ok) {
        return {
          ok: false,
          initialFen,
          moves: [],
          errors: validation.errors,
        };
      }

      if (moves.length > 0) {
        return {
          ok: false,
          initialFen,
          moves: [],
          errors: ["Move application requires chess.js to be wired into the adapter."],
        };
      }

      return {
        ok: true,
        initialFen,
        finalFen: initialFen,
        moves: [],
        errors: [],
      };
    },
  };
}

export function createChessJsRules({
  Chess,
  validateFen,
  pgnLoadOptions,
}: ChessJsRulesOptions): ChessRulesAdapter {
  const validateWithChessJs = (fen: string): PositionValidation => {
    const lightweight = validateFenLightweight(fen);
    if (!lightweight.ok || !lightweight.normalized) {
      return lightweight;
    }

    const externalValidation = validateExternalFen(
      lightweight.normalized,
      validateFen,
    );
    if (!externalValidation.ok) {
      return {
        ok: false,
        source: "chess.js",
        errors: [externalValidation.error],
        warnings: lightweight.warnings,
      };
    }

    try {
      const game = new Chess(lightweight.normalized);
      const canonical = unsafeFen(game.fen());
      const canonicalValidation = validateFenLightweight(canonical);

      return {
        ok: true,
        source: "chess.js",
        normalized: canonical,
        parsed: canonicalValidation.parsed ?? lightweight.parsed,
        errors: [],
        warnings: lightweight.warnings,
      };
    } catch (cause) {
      return {
        ok: false,
        source: "chess.js",
        errors: [errorMessage(cause, "chess.js rejected the FEN.")],
        warnings: lightweight.warnings,
      };
    }
  };

  return {
    validateFen: validateWithChessJs,
    normalizeFen: (fen: string): FenString => {
      const validation = validateWithChessJs(fen);
      if (!validation.ok || !validation.normalized) {
        throw new Error(validation.errors.join(" ") || "Invalid FEN.");
      }

      return validation.normalized;
    },
    legalMoves: (fen: string): readonly ChessMove[] => {
      const validation = validateWithChessJs(fen);
      if (!validation.ok || !validation.normalized) {
        return [];
      }

      const game = new Chess(validation.normalized);
      const moves = game.moves?.({ verbose: true }) ?? [];
      return moves.map(toChessMove);
    },
    loadPgn: (pgn: string): PgnLoadResult => {
      const game = new Chess();
      const loadPgn = game.loadPgn ?? game.load_pgn;

      if (!loadPgn) {
        return {
          ok: false,
          pgn: unsafePgn(pgn),
          moves: [],
          errors: ["This chess.js build does not expose loadPgn/load_pgn."],
          warnings: [],
        };
      }

      try {
        const loaded = loadPgn.call(game, pgn, pgnLoadOptions);
        if (loaded === false) {
          return {
            ok: false,
            pgn: unsafePgn(pgn),
            moves: [],
            errors: ["chess.js could not load the PGN."],
            warnings: [],
          };
        }

        return {
          ok: true,
          pgn: unsafePgn(game.pgn?.() ?? pgn),
          finalFen: unsafeFen(game.fen()),
          moves: (game.history?.({ verbose: true }) ?? []).map(toChessMove),
          headers: extractHeaders(game),
          errors: [],
          warnings: [],
        };
      } catch (cause) {
        return {
          ok: false,
          pgn: unsafePgn(pgn),
          moves: [],
          errors: [errorMessage(cause, "chess.js could not load the PGN.")],
          warnings: [],
        };
      }
    },
    applyMoves: (
      fen: string,
      moves: readonly string[],
    ): MoveApplicationResult => {
      const validation = validateWithChessJs(fen);
      const initialFen = validation.normalized ?? unsafeFen(fen);

      if (!validation.ok || !validation.normalized) {
        return {
          ok: false,
          initialFen,
          moves: [],
          errors: validation.errors,
        };
      }

      const game = new Chess(validation.normalized);
      const appliedMoves: ChessMove[] = [];

      for (const move of moves) {
        const applied = applyChessJsMove(game, move);
        if (!applied) {
          return {
            ok: false,
            initialFen,
            moves: appliedMoves,
            errors: [`Illegal or unparseable move: ${move}`],
          };
        }

        appliedMoves.push(toChessMove(applied));
      }

      return {
        ok: true,
        initialFen,
        finalFen: unsafeFen(game.fen()),
        moves: appliedMoves,
        errors: [],
      };
    },
  };
}

function parsePlacement(
  placement: string,
  errors: string[],
): ReadonlyArray<ReadonlyArray<FenPiece | null>> {
  const rankStrings = placement.split("/");
  const ranks: Array<Array<FenPiece | null>> = [];

  if (rankStrings.length !== 8) {
    errors.push(`FEN board placement must contain 8 ranks, found ${rankStrings.length}.`);
    return ranks;
  }

  for (const [rankIndex, rank] of rankStrings.entries()) {
    const squares: Array<FenPiece | null> = [];
    let fileCount = 0;
    let previousWasDigit = false;

    for (const char of rank) {
      if (/^[1-8]$/.test(char)) {
        if (previousWasDigit) {
          errors.push(`Rank ${rankIndex + 1} contains adjacent empty-square digits.`);
        }
        const emptySquares = Number(char);
        for (let index = 0; index < emptySquares; index += 1) {
          squares.push(null);
        }
        fileCount += emptySquares;
        previousWasDigit = true;
        continue;
      }

      previousWasDigit = false;
      if (!FEN_PIECES.has(char)) {
        errors.push(`Rank ${rankIndex + 1} contains invalid piece '${char}'.`);
        continue;
      }

      squares.push(char as FenPiece);
      fileCount += 1;
    }

    if (fileCount !== 8) {
      errors.push(`Rank ${rankIndex + 1} contains ${fileCount} squares instead of 8.`);
    }

    ranks.push(squares);
  }

  return ranks;
}

function validateCastling(
  castling: string,
  ranks: ReadonlyArray<ReadonlyArray<FenPiece | null>>,
  errors: string[],
  warnings: string[],
): void {
  if (castling === "-") {
    return;
  }

  if (!/^[KQkq]+$/.test(castling)) {
    errors.push("FEN castling rights must be '-' or a combination of KQkq.");
    return;
  }

  for (const right of ["K", "Q", "k", "q"]) {
    if (castling.indexOf(right) !== castling.lastIndexOf(right)) {
      errors.push(`FEN castling right '${right}' is duplicated.`);
    }
  }

  const e1 = ranks[7]?.[4];
  const h1 = ranks[7]?.[7];
  const a1 = ranks[7]?.[0];
  const e8 = ranks[0]?.[4];
  const h8 = ranks[0]?.[7];
  const a8 = ranks[0]?.[0];

  if (castling.includes("K") && (e1 !== "K" || h1 !== "R")) {
    warnings.push("White king-side castling right is set without K on e1 and R on h1.");
  }
  if (castling.includes("Q") && (e1 !== "K" || a1 !== "R")) {
    warnings.push("White queen-side castling right is set without K on e1 and R on a1.");
  }
  if (castling.includes("k") && (e8 !== "k" || h8 !== "r")) {
    warnings.push("Black king-side castling right is set without k on e8 and r on h8.");
  }
  if (castling.includes("q") && (e8 !== "k" || a8 !== "r")) {
    warnings.push("Black queen-side castling right is set without k on e8 and r on a8.");
  }
}

function validateEnPassant(
  enPassant: string,
  activeColor: string,
  errors: string[],
  warnings: string[],
): void {
  if (enPassant === "-") {
    return;
  }

  if (!/^[a-h][36]$/.test(enPassant)) {
    errors.push("FEN en passant target must be '-' or a square on rank 3 or 6.");
    return;
  }

  const rank = enPassant[1];
  if (rank === "3" && activeColor !== "b") {
    warnings.push("An en passant target on rank 3 usually means black is to move.");
  }
  if (rank === "6" && activeColor !== "w") {
    warnings.push("An en passant target on rank 6 usually means white is to move.");
  }
}

function parseIntegerField(
  raw: string,
  label: string,
  minimum: number,
  errors: string[],
): number {
  if (!/^\d+$/.test(raw)) {
    errors.push(`FEN ${label} must be an integer.`);
    return minimum;
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) {
    errors.push(`FEN ${label} must be at least ${minimum}.`);
  }

  return value;
}

function countPiece(
  ranks: ReadonlyArray<ReadonlyArray<FenPiece | null>>,
  piece: FenPiece,
): number {
  return ranks.reduce(
    (total, rank) => total + rank.filter((square) => square === piece).length,
    0,
  );
}

function validateExternalFen(
  fen: FenString,
  validateFen?: ChessJsValidateFen,
): { ok: true } | { ok: false; error: string } {
  if (!validateFen) {
    return { ok: true };
  }

  const result = validateFen(fen);
  if (typeof result === "boolean") {
    return result ? { ok: true } : { ok: false, error: "chess.js rejected the FEN." };
  }

  const ok = result.ok ?? result.valid ?? false;
  if (ok) {
    return { ok: true };
  }

  return {
    ok: false,
    error: result.error ?? result.message ?? "chess.js rejected the FEN.",
  };
}

function applyChessJsMove(game: ChessJsInstance, move: string): unknown {
  if (!game.move) {
    return undefined;
  }

  const uciMove = parseUciMove(move);
  if (uciMove) {
    const applied = game.move(uciMove);
    if (applied) {
      return applied;
    }
  }

  return game.move(move);
}

function parseUciMove(
  move: string,
): { from: string; to: string; promotion?: string } | undefined {
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(move);
  if (!match) {
    return undefined;
  }

  return {
    from: match[1],
    to: match[2],
    ...(match[3] ? { promotion: match[3] } : {}),
  };
}

function toChessMove(move: unknown): ChessMove {
  if (typeof move === "string") {
    return { san: move };
  }

  const record = asRecord(move);
  if (!record) {
    return {};
  }

  const from = asString(record.from);
  const to = asString(record.to);
  const promotion = asString(record.promotion);

  return {
    san: asString(record.san),
    lan: asString(record.lan) ?? buildLan(from, to, promotion),
    from,
    to,
    promotion,
    color: asFenSide(record.color),
    piece: asString(record.piece),
    captured: asString(record.captured),
    flags: asString(record.flags),
    before: asOptionalFen(record.before),
    after: asOptionalFen(record.after),
  };
}

function buildLan(
  from: string | undefined,
  to: string | undefined,
  promotion: string | undefined,
): string | undefined {
  if (!from || !to) {
    return undefined;
  }

  return `${from}${to}${promotion ?? ""}`;
}

function extractHeaders(
  game: ChessJsInstance,
): Readonly<Record<string, string>> | undefined {
  const rawHeaders = game.getHeaders?.() ?? game.header?.();
  const record = asRecord(rawHeaders);
  if (!record) {
    return undefined;
  }

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") {
      headers[key] = value;
    }
  }

  return headers;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asFenSide(value: unknown): FenSide | undefined {
  return value === "w" || value === "b" ? value : undefined;
}

function asOptionalFen(value: unknown): FenString | undefined {
  return typeof value === "string" ? unsafeFen(value) : undefined;
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
