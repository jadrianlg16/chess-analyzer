import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Chess, type Color, type Move, type Square } from "chess.js";
import type { PaletteSelection } from "../components/SetupPanel";
import type { AnalysisLine } from "../lib/analysis";
import { checkBoardMove, type PromotionPiece } from "../lib/boardMove";
import {
  applyMove,
  createTree,
  deleteFrom,
  goTo,
  promoteToMainline,
  stepBackward,
  stepForward,
  toEnd,
  toStart,
  treeFromPgn,
  type GameTree
} from "../lib/gameTree";
import {
  EMPTY_FEN,
  START_FEN,
  buildFen,
  clonePosition,
  parseFen,
  validatePositionFen,
  type PositionState
} from "../lib/position";
import { cueForMove, playSound } from "../lib/sound";

type PendingPromotion = { from: Square; to: Square; color: Color };

type BoardActionsOptions = {
  /** FEN of the position on the board: the setup position in setup mode, else the game's. */
  fen: string;
  positionValid: boolean;
  position: PositionState;
  setPosition: Dispatch<SetStateAction<PositionState>>;
  setupMode: boolean;
  setSetupMode: Dispatch<SetStateAction<boolean>>;
  paletteSelection: PaletteSelection;
  setTree: Dispatch<SetStateAction<GameTree>>;
  fenInput: string;
  pgnInput: string;
  showBoardArrows: boolean;
  setShowBoardArrows: Dispatch<SetStateAction<boolean>>;
  /** Whether live analysis has lines to draw arrows for. */
  hasLines: boolean;
  soundOn: boolean;
  variation: {
    active: boolean;
    select: (sourceFen: string, line: AnalysisLine, ply: number) => void;
    exit: () => void;
  };
  analysis: { analyze: () => void; clear: () => void; showError: (message: string) => void };
  resetReview: () => void;
};

/**
 * Everything the board, the setup panel and the move list can do: select and
 * move pieces (with the promotion picker), step through the game, edit the
 * setup position, load a FEN or PGN, and start analysis. Starting a new game
 * also clears the line preview, the live analysis and the last review.
 */
export function useBoardActions({
  fen,
  positionValid,
  position,
  setPosition,
  setupMode,
  setSetupMode,
  paletteSelection,
  setTree,
  fenInput,
  pgnInput,
  showBoardArrows,
  setShowBoardArrows,
  hasLines,
  soundOn,
  variation,
  analysis,
  resetReview
}: BoardActionsOptions) {
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const { active: previewing, select: selectVariation, exit: exitVariation } = variation;
  const { analyze, clear: clearAnalysis, showError } = analysis;

  // The playable game, or null in setup mode and for an invalid position.
  const game = useMemo(() => {
    if (setupMode || !positionValid) return null;
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }, [fen, positionValid, setupMode]);

  const legalTargets = useMemo(() => {
    if (!game || !selectedSquare || setupMode || previewing) return [];
    return (game.moves({ square: selectedSquare, verbose: true }) as Move[]).map((move) => move.to);
  }, [game, previewing, selectedSquare, setupMode]);

  const resetTreeTo = useCallback(
    (rootFen: string) => {
      setTree(createTree(rootFen));
      exitVariation();
      setSelectedSquare(null);
      clearAnalysis();
      resetReview();
    },
    [clearAnalysis, exitVariation, resetReview, setTree]
  );

  const navigate = useCallback(
    (fn: (tree: GameTree) => GameTree) => {
      setTree((current) => fn(current));
      exitVariation();
      setSelectedSquare(null);
    },
    [exitVariation, setTree]
  );

  const goStart = useCallback(() => navigate(toStart), [navigate]);
  const goPrev = useCallback(() => navigate(stepBackward), [navigate]);
  const goNext = useCallback(() => navigate(stepForward), [navigate]);
  const goEnd = useCallback(() => navigate(toEnd), [navigate]);
  const goToNode = useCallback((id: string | null) => navigate((current) => goTo(current, id)), [navigate]);

  const playMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      if (setupMode || previewing) return;
      const move = checkBoardMove(fen, from, to, promotion);
      if (move.kind === "unavailable") return;
      setSelectedSquare(null);
      if (move.kind === "illegal") return;
      if (move.kind === "needs-promotion") {
        setPendingPromotion({ from, to, color: move.color });
        return;
      }

      setTree((current) => applyMove(current, { from, to, promotion }));
      exitVariation();
      setPendingPromotion(null);
      clearAnalysis();
      if (soundOn) playSound(cueForMove(move.san, move.flags));
    },
    [clearAnalysis, exitVariation, fen, previewing, setTree, setupMode, soundOn]
  );

  function clickSquare(square: Square) {
    if (previewing || pendingPromotion) return;

    if (setupMode) {
      const next = clonePosition(position);
      if (paletteSelection === "erase") {
        delete next.board[square];
      } else {
        next.board[square] = { ...paletteSelection };
      }
      setPosition(next);
      setSelectedSquare(null);
      resetTreeTo(buildFen(next));
      return;
    }

    if (!game) return;

    if (selectedSquare && legalTargets.includes(square)) {
      playMove(selectedSquare, square);
      return;
    }

    const piece = game.get(square);
    setSelectedSquare(piece && piece.color === game.turn() ? square : null);
  }

  function changeMeta(meta: PositionState["meta"]) {
    const next = { ...position, meta };
    setPosition(next);
    resetTreeTo(buildFen(next));
  }

  function changeSetupMode(active: boolean) {
    setSetupMode(active);
    setSelectedSquare(null);
    if (!active) resetTreeTo(buildFen(position));
  }

  function loadFen() {
    const result = validatePositionFen(fenInput);
    if (!result.ok) {
      showError(result.error || "Invalid FEN");
      return;
    }
    setPosition(parseFen(fenInput));
    resetTreeTo(fenInput);
  }

  function loadPgn() {
    try {
      const loaded = treeFromPgn(pgnInput);
      setPosition(parseFen(loaded.rootFen));
      setTree(loaded);
      setSelectedSquare(null);
      exitVariation();
      clearAnalysis();
      resetReview();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Invalid PGN");
    }
  }

  function resetToStart() {
    setPosition(parseFen(START_FEN));
    resetTreeTo(START_FEN);
    setSetupMode(false);
  }

  function clearBoard() {
    setPosition(parseFen(EMPTY_FEN));
    setSetupMode(true);
    resetTreeTo(EMPTY_FEN);
  }

  function analyzeNow() {
    if (!positionValid) return;
    exitVariation();
    setSelectedSquare(null);
    setShowBoardArrows(true);
    analyze();
  }

  function toggleArrows() {
    if (!positionValid) return;
    if (!showBoardArrows && !hasLines) analyze();
    setShowBoardArrows((current) => !current);
  }

  function previewLine(line: AnalysisLine, plyIndex: number) {
    if (!line.uciMoves.length || !positionValid) return;
    setSelectedSquare(null);
    selectVariation(fen, line, plyIndex);
  }

  function promoteLine(id: string) {
    setTree((current) => promoteToMainline(current, id));
  }

  function deleteLine(id: string) {
    setTree((current) => deleteFrom(current, id));
    exitVariation();
    setSelectedSquare(null);
  }

  return {
    game,
    selectedSquare,
    legalTargets,
    pendingPromotion,
    cancelPromotion: () => setPendingPromotion(null),
    goStart,
    goPrev,
    goNext,
    goEnd,
    goToNode,
    playMove,
    clickSquare,
    changeMeta,
    changeSetupMode,
    loadFen,
    loadPgn,
    resetToStart,
    clearBoard,
    analyzeNow,
    toggleArrows,
    previewLine,
    promoteLine,
    deleteLine
  };
}
