export type ParsedScoreExpectation =
  | {
      type: "cp";
      value: number;
      bound?: "lowerbound" | "upperbound";
    }
  | {
      type: "mate";
      value: number;
      bound?: "lowerbound" | "upperbound";
    };

export type ParsedLineExpectation = {
  kind: "info" | "bestmove";
  depth?: number;
  multipv?: number;
  score?: ParsedScoreExpectation;
  pv?: string[];
  bestmove?: string;
  ponder?: string;
};

export type EngineOutputCase = {
  name: string;
  input: string;
  tags: string[];
  expected: ParsedLineExpectation[];
};

export const engineOutputCases: EngineOutputCase[] = [
  {
    name: "single centipawn principal variation",
    input: "info depth 12 seldepth 18 time 102 nodes 50321 nps 493343 score cp 34 pv e2e4 e7e5 g1f3",
    tags: ["info", "cp", "pv"],
    expected: [
      {
        kind: "info",
        depth: 12,
        score: { type: "cp", value: 34 },
        pv: ["e2e4", "e7e5", "g1f3"],
      },
    ],
  },
  {
    name: "negative mate score",
    input: "info depth 9 score mate -3 pv g7g8q h8g8",
    tags: ["info", "mate", "pv"],
    expected: [
      {
        kind: "info",
        depth: 9,
        score: { type: "mate", value: -3 },
        pv: ["g7g8q", "h8g8"],
      },
    ],
  },
  {
    name: "multipv lines out of score order",
    input: [
      "info depth 16 multipv 2 score cp 12 pv d2d4 d7d5 c2c4",
      "info depth 16 multipv 1 score cp 41 pv e2e4 c7c5 g1f3",
    ].join("\n"),
    tags: ["info", "multipv", "cp"],
    expected: [
      {
        kind: "info",
        depth: 16,
        multipv: 2,
        score: { type: "cp", value: 12 },
        pv: ["d2d4", "d7d5", "c2c4"],
      },
      {
        kind: "info",
        depth: 16,
        multipv: 1,
        score: { type: "cp", value: 41 },
        pv: ["e2e4", "c7c5", "g1f3"],
      },
    ],
  },
  {
    name: "bounded centipawn score without pv",
    input: "info depth 20 score cp 87 lowerbound nodes 800000",
    tags: ["info", "cp", "bound", "no-pv"],
    expected: [
      {
        kind: "info",
        depth: 20,
        score: { type: "cp", value: 87, bound: "lowerbound" },
      },
    ],
  },
  {
    name: "bestmove with ponder",
    input: "bestmove e2e4 ponder c7c5",
    tags: ["bestmove", "ponder"],
    expected: [
      {
        kind: "bestmove",
        bestmove: "e2e4",
        ponder: "c7c5",
      },
    ],
  },
  {
    name: "bestmove none",
    input: "bestmove (none)",
    tags: ["bestmove", "terminal"],
    expected: [
      {
        kind: "bestmove",
        bestmove: "(none)",
      },
    ],
  },
  {
    name: "ignore non-analysis engine chatter",
    input: [
      "id name Stockfish",
      "option name Threads type spin default 1 min 1 max 1024",
      "info string NNUE evaluation using nn.bin",
      "readyok",
      "info depth 1 score cp 0 pv e2e4",
    ].join("\n"),
    tags: ["noise", "info", "cp"],
    expected: [
      {
        kind: "info",
        depth: 1,
        score: { type: "cp", value: 0 },
        pv: ["e2e4"],
      },
    ],
  },
];
