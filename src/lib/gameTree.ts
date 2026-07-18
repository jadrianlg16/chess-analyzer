import { Chess, DEFAULT_POSITION, type Square } from "chess.js";
import { START_FEN } from "./position";

/**
 * A single half-move (ply) in the game tree. Every node stores the FEN of the
 * position *after* the move so navigation never has to replay from the root.
 *
 * `children[0]` is the main continuation; `children[1..]` are variations
 * (alternatives to the main continuation from this node's position).
 */
export type MoveNode = {
  id: string;
  parentId: string | null;
  san: string;
  uci: string;
  from: Square;
  to: Square;
  fen: string;
  /** Move number to display (the fullmove counter before the move was made). */
  moveNumber: number;
  /** Side that made this move. */
  color: "w" | "b";
  children: string[];
  /** Optional annotation glyph code ($1 good, $2 mistake, $4 blunder, ...). */
  nag?: number;
};

export type GameTree = {
  rootFen: string;
  nodes: Record<string, MoveNode>;
  /** Continuations from the root position. */
  rootChildren: string[];
  /** `null` means we are sitting on the root position (before any move). */
  currentId: string | null;
};

export type MoveInput = {
  from: Square;
  to: Square;
  promotion?: "q" | "r" | "b" | "n";
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `n_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export function createTree(rootFen: string = START_FEN): GameTree {
  return {
    rootFen,
    nodes: {},
    rootChildren: [],
    currentId: null
  };
}

/** Children ids that continue from the given node (or the root when `null`). */
export function childrenOf(tree: GameTree, id: string | null): string[] {
  if (id === null) return tree.rootChildren;
  return tree.nodes[id]?.children ?? [];
}

/** FEN of the position currently shown on the board. */
export function currentFen(tree: GameTree): string {
  if (!tree.currentId) return tree.rootFen;
  return tree.nodes[tree.currentId]?.fen ?? tree.rootFen;
}

/** From/to of the move that produced the current position (for highlighting). */
export function currentLastMove(tree: GameTree): { from: Square; to: Square } | null {
  if (!tree.currentId) return null;
  const node = tree.nodes[tree.currentId];
  return node ? { from: node.from, to: node.to } : null;
}

export function currentNode(tree: GameTree): MoveNode | null {
  return tree.currentId ? tree.nodes[tree.currentId] ?? null : null;
}

/** FEN of the position *before* the current node's move (its parent). */
function fenBefore(tree: GameTree, id: string | null): string {
  if (!id) return tree.rootFen;
  const node = tree.nodes[id];
  if (!node) return tree.rootFen;
  return node.parentId ? tree.nodes[node.parentId]?.fen ?? tree.rootFen : tree.rootFen;
}

/**
 * Play a move from the current position. If the move already exists as a child
 * of the current node we simply navigate into it (no duplicate branch);
 * otherwise we create a new node. The first move added from a position becomes
 * the main line, later ones become variations.
 */
export function applyMove(tree: GameTree, move: MoveInput): GameTree {
  const baseFen = currentFen(tree);
  const chess = new Chess(baseFen);

  let made;
  try {
    made = chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? "q" });
  } catch {
    return tree;
  }
  if (!made) return tree;

  const uci = `${made.from}${made.to}${made.promotion ?? ""}`;
  const siblings = childrenOf(tree, tree.currentId);
  const existing = siblings.find((childId) => tree.nodes[childId]?.uci === uci);
  if (existing) {
    return { ...tree, currentId: existing };
  }

  const meta = baseFen.split(/\s+/);
  const moveNumber = Number(meta[5] || 1);
  const color = meta[1] === "b" ? "b" : "w";

  const node: MoveNode = {
    id: newId(),
    parentId: tree.currentId,
    san: made.san,
    uci,
    from: made.from,
    to: made.to,
    fen: chess.fen(),
    moveNumber,
    color,
    children: []
  };

  const nodes = { ...tree.nodes, [node.id]: node };
  let rootChildren = tree.rootChildren;

  if (tree.currentId === null) {
    rootChildren = [...tree.rootChildren, node.id];
  } else {
    const parent = nodes[tree.currentId];
    nodes[tree.currentId] = { ...parent, children: [...parent.children, node.id] };
  }

  return { ...tree, nodes, rootChildren, currentId: node.id };
}

export function goTo(tree: GameTree, id: string | null): GameTree {
  if (id !== null && !tree.nodes[id]) return tree;
  return { ...tree, currentId: id };
}

export function stepBackward(tree: GameTree): GameTree {
  if (!tree.currentId) return tree;
  const node = tree.nodes[tree.currentId];
  return { ...tree, currentId: node?.parentId ?? null };
}

export function stepForward(tree: GameTree): GameTree {
  const next = childrenOf(tree, tree.currentId)[0];
  if (!next) return tree;
  return { ...tree, currentId: next };
}

export function toStart(tree: GameTree): GameTree {
  return { ...tree, currentId: null };
}

/** Follow the main line (child[0]) from the current node to its end. */
export function toEnd(tree: GameTree): GameTree {
  let id = tree.currentId;
  let next = childrenOf(tree, id)[0];
  while (next) {
    id = next;
    next = tree.nodes[id]?.children[0];
  }
  return { ...tree, currentId: id };
}

export function canStepBackward(tree: GameTree): boolean {
  return tree.currentId !== null;
}

export function canStepForward(tree: GameTree): boolean {
  return childrenOf(tree, tree.currentId).length > 0;
}

export function setNag(tree: GameTree, id: string, nag: number | undefined): GameTree {
  const node = tree.nodes[id];
  if (!node) return tree;
  return { ...tree, nodes: { ...tree.nodes, [id]: { ...node, nag } } };
}

/** Delete a node and everything after it (used to prune a line). */
export function deleteFrom(tree: GameTree, id: string): GameTree {
  const target = tree.nodes[id];
  if (!target) return tree;

  const removed = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const current = stack.pop()!;
    if (removed.has(current)) continue;
    removed.add(current);
    for (const child of tree.nodes[current]?.children ?? []) stack.push(child);
  }

  const nodes: Record<string, MoveNode> = {};
  for (const [nodeId, node] of Object.entries(tree.nodes)) {
    if (removed.has(nodeId)) continue;
    nodes[nodeId] = { ...node, children: node.children.filter((c) => !removed.has(c)) };
  }

  const rootChildren = tree.rootChildren.filter((c) => !removed.has(c));

  let currentId = tree.currentId;
  if (currentId && removed.has(currentId)) {
    currentId = target.parentId;
  }

  return { ...tree, nodes, rootChildren, currentId };
}

/** Promote a variation so it becomes the main line at its branch point. */
export function promoteToMainline(tree: GameTree, id: string): GameTree {
  const node = tree.nodes[id];
  if (!node) return tree;

  if (node.parentId === null) {
    const index = tree.rootChildren.indexOf(id);
    if (index <= 0) return tree;
    const rootChildren = [...tree.rootChildren];
    rootChildren.splice(index, 1);
    rootChildren.unshift(id);
    return { ...tree, rootChildren };
  }

  const parent = tree.nodes[node.parentId];
  const index = parent.children.indexOf(id);
  if (index <= 0) return tree;
  const children = [...parent.children];
  children.splice(index, 1);
  children.unshift(id);
  return { ...tree, nodes: { ...tree.nodes, [parent.id]: { ...parent, children } } };
}

/**
 * Build a tree from a PGN string. Loads the main line; if the PGN starts from a
 * custom position (FEN/SetUp headers) that becomes the root.
 */
export function treeFromPgn(pgn: string): { tree: GameTree; endAtTip: boolean } {
  const chess = new Chess();
  chess.loadPgn(pgn, { strict: false });

  const header = chess.header();
  const rootFen = header.FEN && header.SetUp === "1" ? header.FEN : header.FEN ?? DEFAULT_POSITION;

  const verbose = chess.history({ verbose: true });
  let tree = createTree(rootFen);
  for (const mv of verbose) {
    tree = applyMove(tree, {
      from: mv.from as Square,
      to: mv.to as Square,
      promotion: mv.promotion as MoveInput["promotion"]
    });
  }
  return { tree, endAtTip: true };
}

/** Serialize the main line to a simple SAN move-number string. */
export function mainlineSan(tree: GameTree): string[] {
  return mainlineNodes(tree).map((node) => node.san);
}

/** The nodes of the main line in order, from the first move to the last. */
export function mainlineNodes(tree: GameTree): MoveNode[] {
  const out: MoveNode[] = [];
  let id = tree.rootChildren[0];
  while (id) {
    const node = tree.nodes[id];
    if (!node) break;
    out.push(node);
    id = node.children[0];
  }
  return out;
}

export function nodePath(tree: GameTree, id: string | null): string[] {
  const path: string[] = [];
  let current = id;
  while (current) {
    path.unshift(current);
    current = tree.nodes[current]?.parentId ?? null;
  }
  return path;
}
