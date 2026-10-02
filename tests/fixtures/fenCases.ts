export type ValidFenCase = {
  name: string;
  fen: string;
};

export type InvalidFenCase = {
  name: string;
  fen: string;
  /** The error `validatePositionFen` must report, so each rejection names its field. */
  error: RegExp;
};

export const validFenCases: ValidFenCase[] = [
  {
    name: "standard start position",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
  },
  {
    name: "kings only, no castling",
    fen: "4k3/8/8/8/8/8/4K3/8 w - - 0 1"
  },
  {
    name: "castling subset with matching rooks",
    fen: "r3k2r/8/8/8/8/8/8/R3K2R b Kq - 3 17"
  },
  {
    name: "white can capture en passant on d6",
    fen: "rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3"
  },
  {
    name: "black can capture en passant on d3",
    fen: "rnbqkbnr/pp1ppppp/8/8/2pP4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 2"
  },
  {
    name: "late endgame counters",
    fen: "8/5k2/8/3P4/8/8/5K2/8 b - - 12 41"
  },
  {
    name: "side to move is in check",
    fen: "4k3/8/8/8/8/8/8/K3R3 b - - 0 1"
  }
];

export const invalidFenCases: InvalidFenCase[] = [
  {
    name: "missing fullmove field",
    fen: "8/8/8/8/8/8/4K3/4k3 w - - 0",
    error: /six space-delimited fields/
  },
  {
    name: "extra field",
    fen: "8/8/8/8/8/8/4K3/4k3 w - - 0 1 extra",
    error: /six space-delimited fields/
  },
  {
    name: "rank has seven files",
    fen: "4k3/8/8/8/8/8/4K3/7 w - - 0 1",
    error: /piece data is invalid/
  },
  {
    name: "invalid piece symbol",
    fen: "4k3/8/8/8/8/8/4K3/4x3 w - - 0 1",
    error: /invalid piece/
  },
  {
    name: "invalid active color",
    fen: "4k3/8/8/8/8/8/4K3/8 x - - 0 1",
    error: /side-to-move is invalid/
  },
  {
    name: "invalid castling token",
    fen: "r3k2r/8/8/8/8/8/8/R3K2R w KQA - 0 1",
    error: /castling availability is invalid/
  },
  {
    name: "en passant square on the wrong rank",
    fen: "4k3/8/8/8/4P3/8/4K3/8 b - e4 0 1",
    error: /en-passant square is invalid/
  },
  {
    name: "negative halfmove clock",
    fen: "4k3/8/8/8/8/8/4K3/8 w - - -1 1",
    error: /half move counter/
  },
  {
    name: "zero fullmove number",
    fen: "4k3/8/8/8/8/8/4K3/8 w - - 0 0",
    error: /move number must be a positive integer/
  },
  {
    name: "missing black king",
    fen: "8/8/8/8/8/8/4K3/8 w - - 0 1",
    error: /missing black king/
  },
  {
    name: "two white kings",
    fen: "4k3/8/8/8/8/8/4K3/4K3 w - - 0 1",
    error: /too many white kings/
  },
  {
    name: "pawn on the first rank",
    fen: "4k3/8/8/8/8/8/4K3/P7 w - - 0 1",
    error: /pawns are on the edge rows/
  },
  {
    name: "adjacent kings",
    fen: "8/8/8/8/8/8/4k3/4K3 w - - 0 1",
    error: /Black is in check but it is not Black's turn/
  },
  {
    name: "side not to move is in check",
    fen: "4k3/8/8/8/8/8/8/K3R3 w - - 0 1",
    error: /Black is in check but it is not Black's turn/
  },
  {
    name: "kingside castling right without a rook",
    fen: "4k3/8/8/8/8/8/8/4K3 w K - 0 1",
    error: /White can't castle kingside without its king on e1 and a rook on h1/
  },
  {
    name: "castling right after the king has moved",
    fen: "r3k2r/8/8/8/8/8/8/R4K1R w Q - 0 1",
    error: /White can't castle queenside without its king on e1/
  },
  {
    name: "black queenside castling right with a white rook on a8",
    fen: "R3k3/8/8/8/8/8/8/4K3 b q - 0 1",
    error: /Black can't castle queenside without its king on e8 and a rook on a8/
  }
];
