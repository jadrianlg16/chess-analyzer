import {
  Chess,
  DEFAULT_POSITION,
  validateFen,
  type Color,
  type Piece,
  type PieceSymbol,
  type Square
} from "chess.js";

export type BoardMap = Partial<Record<Square, Piece>>;

export type CastlingRights = {
  K: boolean;
  Q: boolean;
  k: boolean;
  q: boolean;
};

export type PositionMeta = {
  turn: Color;
  castling: CastlingRights;
  enPassant: string;
  halfmove: number;
  fullmove: number;
};

export type PositionState = {
  board: BoardMap;
  meta: PositionMeta;
};

export const START_FEN = DEFAULT_POSITION;
export const EMPTY_FEN = "8/8/8/8/8/8/8/8 w - - 0 1";

export const files = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const ranks = [8, 7, 6, 5, 4, 3, 2, 1] as const;
export const pieceTypes = ["k", "q", "r", "b", "n", "p"] as const;

export const pieceGlyphs: Record<Color, Record<PieceSymbol, string>> = {
  w: {
    k: "♔",
    q: "♕",
    r: "♖",
    b: "♗",
    n: "♘",
    p: "♙"
  },
  b: {
    k: "♚",
    q: "♛",
    r: "♜",
    b: "♝",
    n: "♞",
    p: "♟"
  }
};

export function squareAt(fileIndex: number, rank: number): Square {
  return `${files[fileIndex]}${rank}` as Square;
}

export function clonePosition(position: PositionState): PositionState {
  return {
    board: { ...position.board },
    meta: {
      ...position.meta,
      castling: { ...position.meta.castling }
    }
  };
}

export function parseFen(fen: string): PositionState {
  const fields = fen.trim().split(/\s+/);
  const placement = fields[0] || "8/8/8/8/8/8/8/8";
  const turn = fields[1] === "b" ? "b" : "w";
  const castlingText = fields[2] && fields[2] !== "-" ? fields[2] : "";
  const board: BoardMap = {};
  const rows = placement.split("/");

  rows.forEach((row, rankIndex) => {
    let fileIndex = 0;
    for (const char of row) {
      if (/\d/.test(char)) {
        fileIndex += Number(char);
        continue;
      }

      const color: Color = char === char.toUpperCase() ? "w" : "b";
      const type = char.toLowerCase() as PieceSymbol;
      if (pieceTypes.includes(type) && fileIndex < 8) {
        board[squareAt(fileIndex, 8 - rankIndex)] = { color, type };
      }
      fileIndex += 1;
    }
  });

  return {
    board,
    meta: {
      turn,
      castling: {
        K: castlingText.includes("K"),
        Q: castlingText.includes("Q"),
        k: castlingText.includes("k"),
        q: castlingText.includes("q")
      },
      enPassant: fields[3] || "-",
      halfmove: Number(fields[4] || 0),
      fullmove: Math.max(1, Number(fields[5] || 1))
    }
  };
}

export function buildFen(position: PositionState): string {
  const rows = ranks.map((rank) => {
    let row = "";
    let empty = 0;

    for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
      const piece = position.board[squareAt(fileIndex, rank)];
      if (!piece) {
        empty += 1;
        continue;
      }

      if (empty) {
        row += empty;
        empty = 0;
      }

      const symbol = piece.color === "w" ? piece.type.toUpperCase() : piece.type;
      row += symbol;
    }

    return row + (empty ? String(empty) : "");
  });

  const castling =
    `${position.meta.castling.K ? "K" : ""}${position.meta.castling.Q ? "Q" : ""}${
      position.meta.castling.k ? "k" : ""
    }${position.meta.castling.q ? "q" : ""}` || "-";

  return [
    rows.join("/"),
    position.meta.turn,
    castling,
    normalizeEnPassant(position.meta.enPassant),
    Number.isFinite(position.meta.halfmove) ? Math.max(0, position.meta.halfmove) : 0,
    Number.isFinite(position.meta.fullmove) ? Math.max(1, position.meta.fullmove) : 1
  ].join(" ");
}

export function normalizeEnPassant(value: string): string {
  const trimmed = value.trim();
  return /^[a-h][36]$/.test(trimmed) ? trimmed : "-";
}

export function validatePositionFen(fen: string): { ok: boolean; error?: string } {
  const result = validateFen(fen);
  if (!result.ok) {
    return { ok: false, error: result.error || "Invalid FEN" };
  }

  try {
    new Chess(fen);
    // Stockfish returns no analysis at all when the side that just moved is
    // still in check, so reject that setup here with a clear reason.
    const fields = fen.trim().split(/\s+/);
    const flipped = [fields[0], fields[1] === "w" ? "b" : "w", fields[2] ?? "-", "-", "0", "1"].join(" ");
    if (new Chess(flipped, { skipValidation: true }).isCheck()) {
      const waiting = fields[1] === "w" ? "Black" : "White";
      return { ok: false, error: `${waiting} is in check but it is not ${waiting}'s turn.` };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid position"
    };
  }
}

export function moveFromUci(chess: Chess, uci: string) {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.slice(4, 5) || "q";
  return chess.move({ from, to, promotion });
}

export function uciLineToSan(fen: string, moves: string[]): string[] {
  const chess = new Chess(fen);
  const sans: string[] = [];

  for (const move of moves) {
    try {
      const made = moveFromUci(chess, move);
      sans.push(made.san);
    } catch {
      break;
    }
  }

  return sans;
}
