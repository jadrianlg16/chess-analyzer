import { useCallback, useMemo, useRef, useState } from "react";
import { Chess, type Color, type Move, type Square } from "chess.js";
import { Activity, Crown } from "lucide-react";
import { AnalysisPanel } from "./components/AnalysisPanel";
import { AppearancePanel } from "./components/AppearancePanel";
import { ChessBoard } from "./components/ChessBoard";
import { EvalBar } from "./components/EvalBar";
import { GameNavBar } from "./components/GameNavBar";
import { GameStatusBanner } from "./components/GameStatusBanner";
import { MovePanel } from "./components/MovePanel";
import { PromotionOverlay } from "./components/PromotionOverlay";
import { SetupPanel, type PaletteSelection } from "./components/SetupPanel";
import { VariationBanner } from "./components/VariationBanner";
import { useAppearanceSettings } from "./hooks/useAppearanceSettings";
import { useCopyNotice } from "./hooks/useCopyNotice";
import { useGameReview } from "./hooks/useGameReview";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useLiveAnalysis } from "./hooks/useLiveAnalysis";
import { useMoveGrading } from "./hooks/useMoveGrading";
import { useResettableState } from "./hooks/useResettableState";
import { useVariationPreview } from "./hooks/useVariationPreview";
import type { AnalysisLine } from "./lib/analysis";
import { boardArrows } from "./lib/arrows";
import { checkBoardMove, type PromotionPiece } from "./lib/boardMove";
import { gameStatusOf } from "./lib/gameStatus";
import {
  applyMove,
  canStepBackward,
  canStepForward,
  createTree,
  currentFen,
  currentLastMove,
  deleteFrom,
  goTo,
  mainlinePgn,
  nodePath,
  promoteToMainline,
  stepBackward,
  stepForward,
  toEnd,
  toStart,
  treeFromPgn,
  type GameTree
} from "./lib/gameTree";
import {
  EMPTY_FEN,
  START_FEN,
  buildFen,
  clonePosition,
  parseFen,
  validatePositionFen,
  type PositionState
} from "./lib/position";
import type { PositionEval } from "./lib/review";
import { cueForMove, playSound } from "./lib/sound";

type PendingPromotion = { from: Square; to: Square; color: Color };

/**
 * The analysis board. Owns the game (setup position and move tree) and wires
 * it to the engine hooks; the panels and the board are presentational.
 */
export default function App() {
  const [position, setPosition] = useState<PositionState>(() => parseFen(START_FEN));
  const [tree, setTree] = useState<GameTree>(() => createTree(START_FEN));
  const [setupMode, setSetupMode] = useState(false);
  const [orientation, setOrientation] = useState<"w" | "b">("w");
  const [paletteSelection, setPaletteSelection] = useState<PaletteSelection>({ color: "w", type: "p" });
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [depth, setDepth] = useState(14);
  const [multipv, setMultipv] = useState(3);
  // Engine evaluations by FEN, filled by live analysis and game reviews.
  const evalCacheRef = useRef<Map<string, PositionEval>>(new Map());
  const appearance = useAppearanceSettings();
  const clipboard = useCopyNotice();
  const {
    variation: activeVariation,
    preview: variationPreview,
    view: activeVariationView,
    select: selectVariation,
    step: stepVariation,
    exit: exitVariation
  } = useVariationPreview();

  const baseFen = useMemo(() => buildFen(position), [position]);
  const treeFen = useMemo(() => currentFen(tree), [tree]);
  const fen = setupMode ? baseFen : treeFen;
  const validation = useMemo(() => validatePositionFen(fen), [fen]);
  const pgn = useMemo(() => mainlinePgn(tree), [tree]);
  // The FEN and PGN boxes follow the game but can be edited before loading.
  const [fenInput, setFenInput] = useResettableState(fen, fen);
  const [pgnInput, setPgnInput] = useResettableState(pgn, pgn);
  // Engine arrows are switched on for one position at a time.
  const [showBoardArrows, setShowBoardArrows] = useResettableState(false, fen);

  const review = useGameReview({
    tree,
    setTree,
    evalCache: evalCacheRef,
    onStart: exitVariation
  });
  const { reset: resetReview } = review;
  const {
    analysis,
    live: liveAnalysis,
    analyze,
    stop: stopAnalysis,
    clear: clearAnalysis,
    showError
  } = useLiveAnalysis({ fen, validation, paused: review.running, depth, multipv });
  useMoveGrading({
    analysis,
    fen,
    enabled: !setupMode && !review.running,
    tree,
    setTree,
    reviewedMoves: review.reviewedMoves,
    evalCache: evalCacheRef
  });

  const game = useMemo(() => {
    if (setupMode || !validation.ok) return null;
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }, [fen, validation.ok, setupMode]);

  const treePosition = useMemo(() => parseFen(treeFen), [treeFen]);
  const displayPosition = variationPreview?.position ?? (setupMode ? position : treePosition);
  const displayLastMove = variationPreview?.lastMove ?? (setupMode ? null : currentLastMove(tree));
  const displayFen = variationPreview?.fen ?? fen;
  const gameStatus = useMemo(() => (setupMode ? null : gameStatusOf(displayFen)), [displayFen, setupMode]);

  const legalTargets = useMemo(() => {
    if (!game || !selectedSquare || setupMode || activeVariation) return [];
    return (game.moves({ square: selectedSquare, verbose: true }) as Move[]).map((move) => move.to);
  }, [activeVariation, game, selectedSquare, setupMode]);

  const arrows = useMemo(
    () => boardArrows(activeVariation, liveAnalysis.lines, showBoardArrows),
    [activeVariation, liveAnalysis.lines, showBoardArrows]
  );

  const ply = useMemo(() => nodePath(tree, tree.currentId).length, [tree]);
  const total = useMemo(() => nodePath(tree, toEnd(tree).currentId).length, [tree]);

  const resetTreeTo = useCallback(
    (rootFen: string) => {
      setTree(createTree(rootFen));
      exitVariation();
      setSelectedSquare(null);
      clearAnalysis();
      resetReview();
    },
    [clearAnalysis, exitVariation, resetReview]
  );

  const navigate = useCallback((fn: (tree: GameTree) => GameTree) => {
    setTree((current) => fn(current));
    exitVariation();
    setSelectedSquare(null);
  }, [exitVariation]);

  const goStart = useCallback(() => navigate(toStart), [navigate]);
  const goPrev = useCallback(() => navigate(stepBackward), [navigate]);
  const goNext = useCallback(() => navigate(stepForward), [navigate]);
  const goEnd = useCallback(() => navigate(toEnd), [navigate]);
  const goToNode = useCallback((id: string | null) => navigate((current) => goTo(current, id)), [navigate]);
  const flipBoard = useCallback(() => setOrientation((current) => (current === "w" ? "b" : "w")), []);

  useKeyboardShortcuts(!setupMode && !pendingPromotion, {
    onStart: goStart,
    onPrev: goPrev,
    onNext: goNext,
    onEnd: goEnd,
    onFlip: flipBoard
  });

  const playMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      if (setupMode || activeVariation) return;
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
      if (appearance.soundOn) playSound(cueForMove(move.san, move.flags));
    },
    [activeVariation, appearance.soundOn, clearAnalysis, exitVariation, fen, setupMode]
  );

  function handleSquareClick(square: Square) {
    if (activeVariation || pendingPromotion) return;

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

  function handleMetaChange(meta: PositionState["meta"]) {
    const next = { ...position, meta };
    setPosition(next);
    resetTreeTo(buildFen(next));
  }

  function handleSetupModeChange(active: boolean) {
    setSetupMode(active);
    setSelectedSquare(null);
    if (!active) resetTreeTo(buildFen(position));
  }

  function handleLoadFen() {
    const result = validatePositionFen(fenInput);
    if (!result.ok) {
      showError(result.error || "Invalid FEN");
      return;
    }
    setPosition(parseFen(fenInput));
    resetTreeTo(fenInput);
  }

  function handleLoadPgn() {
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

  function handleReset() {
    setPosition(parseFen(START_FEN));
    resetTreeTo(START_FEN);
    setSetupMode(false);
  }

  function handleClear() {
    setPosition(parseFen(EMPTY_FEN));
    setSetupMode(true);
    resetTreeTo(EMPTY_FEN);
  }

  function handleAnalyze() {
    if (!validation.ok) return;
    exitVariation();
    setSelectedSquare(null);
    setShowBoardArrows(true);
    analyze();
  }

  function handleToggleBoardArrows() {
    if (!validation.ok) return;
    if (!showBoardArrows && !liveAnalysis.lines.length) analyze();
    setShowBoardArrows((current) => !current);
  }

  function handleSelectVariation(line: AnalysisLine, plyIndex: number) {
    if (!line.uciMoves.length || !validation.ok) return;
    setSelectedSquare(null);
    selectVariation(fen, line, plyIndex);
  }

  const canInteract = !setupMode && !activeVariation && Boolean(game);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">
          <Crown size={22} />
        </div>
        <div>
          <p className="eyebrow">Analysis board</p>
          <h1>Chess Analyzer</h1>
        </div>
        <div className="topbar-status">
          <Activity size={16} />
          <span>{validation.ok ? "Position ready" : "Setup incomplete"}</span>
        </div>
      </header>

      <div className="workspace">
        <section className="board-stage" aria-label="Analyzer board">
          {activeVariation ? (
            <VariationBanner
              multipv={activeVariation.multipv}
              ply={activeVariation.ply}
              total={activeVariation.uciMoves.length}
              playedSans={variationPreview?.playedSans ?? []}
            />
          ) : null}
          <div className="board-with-eval">
            <EvalBar fen={fen} line={liveAnalysis.lines[0]} status={liveAnalysis.status} />
            <div className="board-column">
              <ChessBoard
                board={displayPosition.board}
                orientation={orientation}
                boardTheme={appearance.boardTheme}
                pieceTheme={appearance.pieceTheme}
                selectedSquare={activeVariation ? null : selectedSquare}
                legalTargets={legalTargets}
                lastMove={displayLastMove}
                arrows={arrows}
                draggable={canInteract}
                onSquareClick={handleSquareClick}
                onMove={playMove}
              />
              {pendingPromotion ? (
                <PromotionOverlay
                  color={pendingPromotion.color}
                  pieceTheme={appearance.pieceTheme}
                  onSelect={(piece) => playMove(pendingPromotion.from, pendingPromotion.to, piece)}
                  onCancel={() => setPendingPromotion(null)}
                />
              ) : null}
            </div>
          </div>
          {gameStatus ? <GameStatusBanner status={gameStatus} /> : null}
          {!setupMode ? (
            <GameNavBar
              canBack={canStepBackward(tree)}
              canForward={canStepForward(tree)}
              atStart={tree.currentId === null}
              onStart={goStart}
              onPrev={goPrev}
              onNext={goNext}
              onEnd={goEnd}
              onFlip={flipBoard}
              ply={ply}
              total={total}
            />
          ) : null}
        </section>

        <aside className="side-rail" aria-label="Analyzer controls">
          <AnalysisPanel
            status={liveAnalysis.status}
            lines={liveAnalysis.lines}
            bestMove={liveAnalysis.bestMove}
            message={liveAnalysis.message}
            fen={fen}
            depth={depth}
            multipv={multipv}
            activeVariation={activeVariationView}
            showBoardArrows={showBoardArrows}
            canAnalyze={validation.ok}
            onDepthChange={setDepth}
            onMultipvChange={setMultipv}
            onAnalyze={handleAnalyze}
            onStop={stopAnalysis}
            onToggleBoardArrows={handleToggleBoardArrows}
            onSelectLine={handleSelectVariation}
            onStepVariation={stepVariation}
            onExitVariation={exitVariation}
          />

          <AppearancePanel
            boardTheme={appearance.boardTheme}
            pieceTheme={appearance.pieceTheme}
            soundOn={appearance.soundOn}
            onBoardThemeChange={appearance.setBoardTheme}
            onPieceThemeChange={appearance.setPieceTheme}
            onSoundChange={appearance.setSoundOn}
          />

          <SetupPanel
            active={setupMode}
            selection={paletteSelection}
            meta={position.meta}
            fen={fen}
            fenInput={fenInput}
            validation={validation}
            pieceTheme={appearance.pieceTheme}
            onModeChange={handleSetupModeChange}
            onSelectionChange={setPaletteSelection}
            onFenInputChange={setFenInput}
            onLoadFen={handleLoadFen}
            onMetaChange={handleMetaChange}
            onReset={handleReset}
            onClear={handleClear}
            onFlip={flipBoard}
            onCopyFen={() => void clipboard.copy(fen, "FEN")}
          />

          <MovePanel
            tree={tree}
            pgn={pgn}
            pgnInput={pgnInput}
            onPgnInputChange={setPgnInput}
            onLoadPgn={handleLoadPgn}
            onCopyPgn={() => void clipboard.copy(pgn, "PGN")}
            onGoTo={goToNode}
            onPromote={(id) => setTree((current) => promoteToMainline(current, id))}
            onDelete={(id) => {
              setTree((current) => deleteFrom(current, id));
              exitVariation();
              setSelectedSquare(null);
            }}
            onAnalyzeGame={review.start}
            onCancelAnalyzeGame={review.cancel}
            analyzing={review.running}
            analyzeProgress={review.progress}
            reviewView={review.view}
            reviewError={review.error}
            reviewPreset={review.preset}
            onReviewPresetChange={review.setPreset}
            canAnalyzeGame={tree.rootChildren.length > 0}
          />
        </aside>
      </div>
      <p className={`copy-notice ${clipboard.notice?.ok === false ? "failed" : ""}`} role="status">
        {clipboard.notice?.message ?? ""}
      </p>
    </main>
  );
}
