export type FenCase = {
  name: string;
  fen: string;
  tags: string[];
  reason?: string;
};

export const validFenCases: FenCase[] = [
  {
    name: "standard start position",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    tags: ["baseline", "castling"],
  },
  {
    name: "kings only no castling",
    fen: "4k3/8/8/8/8/8/4K3/8 w - - 0 1",
    tags: ["minimal", "no-castling"],
  },
  {
    name: "castling subset with matching rooks",
    fen: "r3k2r/8/8/8/8/8/8/R3K2R b Kq - 3 17",
    tags: ["castling", "setup-mode"],
  },
  {
    name: "white can capture en passant on d6",
    fen: "rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3",
    tags: ["en-passant", "opening"],
  },
  {
    name: "black can capture en passant on d3",
    fen: "rnbqkbnr/pp1ppppp/8/8/2pP4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 2",
    tags: ["en-passant", "opening"],
  },
  {
    name: "legal counters late position",
    fen: "8/5k2/8/3P4/8/8/5K2/8 b - - 12 41",
    tags: ["counters", "endgame"],
  },
];

export const invalidFenCases: FenCase[] = [
  {
    name: "missing fullmove field",
    fen: "8/8/8/8/8/8/4K3/4k3 w - - 0",
    tags: ["field-count"],
    reason: "FEN must contain exactly six fields.",
  },
  {
    name: "extra field",
    fen: "8/8/8/8/8/8/4K3/4k3 w - - 0 1 extra",
    tags: ["field-count"],
    reason: "FEN must not contain more than six fields.",
  },
  {
    name: "rank has seven files",
    fen: "4k3/8/8/8/8/8/4K3/7 w - - 0 1",
    tags: ["board"],
    reason: "Each rank must expand to exactly eight files.",
  },
  {
    name: "invalid piece symbol",
    fen: "4k3/8/8/8/8/8/4K3/4x3 w - - 0 1",
    tags: ["board"],
    reason: "Only PNBRQK and pnbrqk piece symbols are valid.",
  },
  {
    name: "invalid active color",
    fen: "4k3/8/8/8/8/8/4K3/8 x - - 0 1",
    tags: ["active-color"],
    reason: "Active color must be w or b.",
  },
  {
    name: "invalid castling token",
    fen: "r3k2r/8/8/8/8/8/8/R3K2R w KQA - 0 1",
    tags: ["castling"],
    reason: "Castling availability may only contain KQkq or -.",
  },
  {
    name: "invalid en passant rank",
    fen: "4k3/8/8/8/4P3/8/4K3/8 b - e4 0 1",
    tags: ["en-passant"],
    reason: "En-passant target must be - or a square on rank 3 or 6.",
  },
  {
    name: "negative halfmove clock",
    fen: "4k3/8/8/8/8/8/4K3/8 w - - -1 1",
    tags: ["counters"],
    reason: "Halfmove clock must be a non-negative integer.",
  },
  {
    name: "zero fullmove number",
    fen: "4k3/8/8/8/8/8/4K3/8 w - - 0 0",
    tags: ["counters"],
    reason: "Fullmove number must be at least 1.",
  },
  {
    name: "missing black king",
    fen: "8/8/8/8/8/8/4K3/8 w - - 0 1",
    tags: ["semantic", "king-count"],
    reason: "A legal setup must contain exactly one black king.",
  },
  {
    name: "duplicate white kings",
    fen: "4k3/8/8/8/8/8/4K3/4K3 w - - 0 1",
    tags: ["semantic", "king-count"],
    reason: "A legal setup must contain exactly one white king.",
  },
  {
    name: "pawn on first rank",
    fen: "4k3/8/8/8/8/8/4K3/P7 w - - 0 1",
    tags: ["semantic", "pawn-placement"],
    reason: "Pawns cannot be placed on the first or eighth rank.",
  },
  {
    name: "adjacent kings",
    fen: "8/8/8/8/8/8/4k3/4K3 w - - 0 1",
    tags: ["semantic", "king-safety"],
    reason: "Kings may not occupy adjacent squares.",
  },
  {
    name: "castling right without rook",
    fen: "4k3/8/8/8/8/8/8/4K3 w K - 0 1",
    tags: ["semantic", "castling"],
    reason: "Castling rights must match kings and rooks on their original squares.",
  },
];
