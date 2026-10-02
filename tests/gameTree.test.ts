import { describe, expect, it } from "vitest";
import type { Square } from "chess.js";
import {
  applyMove,
  canStepBackward,
  canStepForward,
  createTree,
  currentFen,
  currentLastMove,
  deleteFrom,
  goTo,
  mainlineNodes,
  mainlinePgn,
  mainlineSan,
  nodePath,
  promoteToMainline,
  setNag,
  stepBackward,
  stepForward,
  toEnd,
  toStart,
  treeFromPgn,
  type GameTree
} from "../src/lib/gameTree";
import { START_FEN } from "../src/lib/position";

function play(tree: GameTree, ...moves: string[]): GameTree {
  return moves.reduce(
    (current, uci) => applyMove(current, { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square }),
    tree
  );
}

describe("move tree", () => {
  it("records the main line with move numbers, sides and positions", () => {
    const tree = play(createTree(), "e2e4", "e7e5", "g1f3");
    const [e4, e5, nf3] = mainlineNodes(tree);

    expect(mainlineSan(tree)).toEqual(["e4", "e5", "Nf3"]);
    expect([e4.moveNumber, e5.moveNumber, nf3.moveNumber]).toEqual([1, 1, 2]);
    expect([e4.color, e5.color, nf3.color]).toEqual(["w", "b", "w"]);
    expect(currentFen(tree)).toBe("rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2");
    expect(currentLastMove(tree)).toEqual({ from: "g1", to: "f3" });
  });

  it("starts a variation for a different move and reuses an existing one", () => {
    let tree = play(createTree(), "e2e4", "e7e5");
    tree = play(stepBackward(tree), "c7c5");
    expect(mainlineSan(tree)).toEqual(["e4", "e5"]);
    const e4 = mainlineNodes(tree)[0];
    expect(e4.children).toHaveLength(2);

    const again = play(stepBackward(tree), "c7c5");
    expect(again.nodes[e4.id].children).toHaveLength(2);
    expect(again.currentId).toBe(tree.currentId);
  });

  it("ignores an illegal move", () => {
    const tree = createTree();
    expect(play(tree, "e2e5")).toBe(tree);
  });

  it("navigates the main line", () => {
    const tree = play(createTree(), "d2d4", "d7d5", "c2c4");
    expect(canStepForward(tree)).toBe(false);

    const start = toStart(tree);
    expect(start.currentId).toBeNull();
    expect(canStepBackward(start)).toBe(false);
    expect(currentFen(start)).toBe(START_FEN);

    const second = stepForward(stepForward(start));
    expect(nodePath(second, second.currentId)).toHaveLength(2);
    expect(toEnd(start).currentId).toBe(tree.currentId);
    expect(goTo(tree, "missing")).toBe(tree);
  });

  it("promotes a variation to the main line", () => {
    let tree = play(createTree(), "e2e4");
    tree = play(toStart(tree), "d2d4");
    expect(mainlineSan(tree)).toEqual(["e4"]);

    tree = promoteToMainline(tree, tree.currentId!);
    expect(mainlineSan(tree)).toEqual(["d4"]);
  });

  it("deletes a move and everything after it", () => {
    let tree = play(createTree(), "e2e4", "e7e5", "g1f3");
    const e5 = mainlineNodes(tree)[1];
    tree = deleteFrom(tree, e5.id);

    expect(mainlineSan(tree)).toEqual(["e4"]);
    expect(Object.keys(tree.nodes)).toHaveLength(1);
    // The board was on a deleted move, so it moves back to the parent.
    expect(tree.currentId).toBe(e5.parentId);
  });

  it("stores annotation glyphs per move", () => {
    const tree = play(createTree(), "f2f3");
    const id = tree.currentId!;
    expect(setNag(tree, id, 4).nodes[id].nag).toBe(4);
    expect(setNag(tree, "missing", 4)).toBe(tree);
  });
});

describe("PGN", () => {
  const scholar = "1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0";

  it("loads the main line and ends on the last move", () => {
    const { tree } = treeFromPgn(scholar);
    expect(mainlineSan(tree)).toEqual(["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"]);
    expect(tree.rootFen).toBe(START_FEN);
    expect(tree.currentId).toBe(mainlineNodes(tree).at(-1)?.id);
  });

  it("uses the FEN header as the starting position", () => {
    const fen = "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1";
    const { tree } = treeFromPgn(`[SetUp "1"]\n[FEN "${fen}"]\n\n1. e4 Kd7 *`);
    expect(tree.rootFen).toBe(fen);
    expect(mainlineSan(tree)).toEqual(["e4", "Kd7"]);
  });

  it("throws on movetext that isn't legal", () => {
    expect(() => treeFromPgn("1. e5 e4")).toThrow();
  });

  it("writes the main line back out as PGN", () => {
    const { tree } = treeFromPgn(scholar);
    const pgn = mainlinePgn(tree);
    expect(pgn).toContain("4. Qxf7#");
    expect(mainlineSan(treeFromPgn(pgn).tree)).toEqual(mainlineSan(tree));
    expect(mainlinePgn(createTree())).not.toMatch(/1\./);
  });
});
