import type { UciInfo } from "../../src/lib/engine";

/**
 * Raw worker output and the analysis lines `parseUciInfo` must extract from
 * it. A message can carry several lines; `bestmove` and other chatter are
 * handled elsewhere, so they must parse to nothing here.
 */
export type EngineOutputCase = {
  name: string;
  output: string;
  expected: UciInfo[];
};

export const engineOutputCases: EngineOutputCase[] = [
  {
    name: "single centipawn principal variation",
    output: "info depth 12 seldepth 18 time 102 nodes 50321 nps 493343 score cp 34 pv e2e4 e7e5 g1f3",
    expected: [{ multipv: 1, depth: 12, score: { kind: "cp", value: 34 }, pv: ["e2e4", "e7e5", "g1f3"], nodes: 50321 }]
  },
  {
    name: "negative mate score with a promotion in the pv",
    output: "info depth 9 score mate -3 pv g7g8q h8g8",
    expected: [{ multipv: 1, depth: 9, score: { kind: "mate", value: -3 }, pv: ["g7g8q", "h8g8"] }]
  },
  {
    name: "multipv lines out of score order",
    output: [
      "info depth 16 multipv 2 score cp 12 pv d2d4 d7d5 c2c4",
      "info depth 16 multipv 1 score cp 41 pv e2e4 c7c5 g1f3"
    ].join("\n"),
    expected: [
      { multipv: 2, depth: 16, score: { kind: "cp", value: 12 }, pv: ["d2d4", "d7d5", "c2c4"] },
      { multipv: 1, depth: 16, score: { kind: "cp", value: 41 }, pv: ["e2e4", "c7c5", "g1f3"] }
    ]
  },
  {
    name: "bounded score without a pv",
    output: "info depth 20 score cp 87 lowerbound nodes 800000",
    expected: [{ multipv: 1, depth: 20, score: { kind: "cp", value: 87 }, bound: "lower", pv: [], nodes: 800000 }]
  },
  {
    name: "upper bound",
    output: "info depth 11 multipv 3 score cp -15 upperbound pv a2a3",
    expected: [{ multipv: 3, depth: 11, score: { kind: "cp", value: -15 }, bound: "upper", pv: ["a2a3"] }]
  },
  {
    name: "bestmove lines",
    output: ["bestmove e2e4 ponder c7c5", "bestmove (none)"].join("\n"),
    expected: []
  },
  {
    name: "engine chatter around one real line",
    output: [
      "id name Stockfish",
      "option name Threads type spin default 1 min 1 max 1024",
      "info string NNUE evaluation using nn.bin",
      "readyok",
      "info depth 20 currmove e2e4 currmovenumber 1",
      "info depth 1 score cp 0 pv e2e4"
    ].join("\n"),
    expected: [{ multipv: 1, depth: 1, score: { kind: "cp", value: 0 }, pv: ["e2e4"] }]
  },
  {
    name: "score with a non-numeric value",
    output: "info depth 4 score cp nan pv e2e4",
    expected: []
  }
];
