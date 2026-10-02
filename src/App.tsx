import { useCallback, useMemo, useRef, useState } from "react";
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
import { useBoardActions } from "./hooks/useBoardActions";
import { useCopyNotice } from "./hooks/useCopyNotice";
import { useGameReview } from "./hooks/useGameReview";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useLiveAnalysis } from "./hooks/useLiveAnalysis";
import { useMoveGrading } from "./hooks/useMoveGrading";
import { useResettableState } from "./hooks/useResettableState";
import { useVariationPreview } from "./hooks/useVariationPreview";
import { boardArrows } from "./lib/arrows";
import { gameStatusOf } from "./lib/gameStatus";
import {
  canStepBackward,
  canStepForward,
  createTree,
  currentFen,
  currentLastMove,
  mainlinePgn,
  nodePath,
  toEnd,
  type GameTree
} from "./lib/gameTree";
import { START_FEN, buildFen, parseFen, validatePositionFen, type PositionState } from "./lib/position";
import type { PositionEval } from "./lib/review";

/**
 * The analysis board. Owns the game (setup position and move tree) and wires
 * it to the hooks; the panels and the board are presentational.
 */
export default function App() {
  const [position, setPosition] = useState<PositionState>(() => parseFen(START_FEN));
  const [tree, setTree] = useState<GameTree>(() => createTree(START_FEN));
  const [setupMode, setSetupMode] = useState(false);
  const [orientation, setOrientation] = useState<"w" | "b">("w");
  const [paletteSelection, setPaletteSelection] = useState<PaletteSelection>({ color: "w", type: "p" });
  const [depth, setDepth] = useState(14);
  const [multipv, setMultipv] = useState(3);
  // Engine evaluations by FEN, filled by live analysis and game reviews.
  const evalCacheRef = useRef<Map<string, PositionEval>>(new Map());
  const appearance = useAppearanceSettings();
  const clipboard = useCopyNotice();
  const variation = useVariationPreview();
  const activeVariation = variation.variation;

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

  const review = useGameReview({ tree, setTree, evalCache: evalCacheRef, onStart: variation.exit });
  const live = useLiveAnalysis({ fen, validation, paused: review.running, depth, multipv });
  const liveAnalysis = live.live;
  useMoveGrading({
    analysis: live.analysis,
    fen,
    enabled: !setupMode && !review.running,
    tree,
    setTree,
    reviewedMoves: review.reviewedMoves,
    evalCache: evalCacheRef
  });

  const board = useBoardActions({
    fen,
    positionValid: validation.ok,
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
    hasLines: liveAnalysis.lines.length > 0,
    soundOn: appearance.soundOn,
    variation: { active: Boolean(activeVariation), select: variation.select, exit: variation.exit },
    analysis: { analyze: live.analyze, clear: live.clear, showError: live.showError },
    resetReview: review.reset
  });
  const { pendingPromotion } = board;

  const flipBoard = useCallback(() => setOrientation((current) => (current === "w" ? "b" : "w")), []);
  useKeyboardShortcuts(!setupMode && !pendingPromotion, {
    onStart: board.goStart,
    onPrev: board.goPrev,
    onNext: board.goNext,
    onEnd: board.goEnd,
    onFlip: flipBoard
  });

  const treePosition = useMemo(() => parseFen(treeFen), [treeFen]);
  const preview = variation.preview;
  const displayPosition = preview?.position ?? (setupMode ? position : treePosition);
  const displayLastMove = preview?.lastMove ?? (setupMode ? null : currentLastMove(tree));
  const displayFen = preview?.fen ?? fen;
  const gameStatus = useMemo(() => (setupMode ? null : gameStatusOf(displayFen)), [displayFen, setupMode]);
  const arrows = useMemo(
    () => boardArrows(activeVariation, liveAnalysis.lines, showBoardArrows),
    [activeVariation, liveAnalysis.lines, showBoardArrows]
  );
  const ply = useMemo(() => nodePath(tree, tree.currentId).length, [tree]);
  const total = useMemo(() => nodePath(tree, toEnd(tree).currentId).length, [tree]);
  const canInteract = !setupMode && !activeVariation && Boolean(board.game);

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
              playedSans={preview?.playedSans ?? []}
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
                selectedSquare={activeVariation ? null : board.selectedSquare}
                legalTargets={board.legalTargets}
                lastMove={displayLastMove}
                arrows={arrows}
                draggable={canInteract}
                onSquareClick={board.clickSquare}
                onMove={board.playMove}
              />
              {pendingPromotion ? (
                <PromotionOverlay
                  color={pendingPromotion.color}
                  pieceTheme={appearance.pieceTheme}
                  onSelect={(piece) => board.playMove(pendingPromotion.from, pendingPromotion.to, piece)}
                  onCancel={board.cancelPromotion}
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
              onStart={board.goStart}
              onPrev={board.goPrev}
              onNext={board.goNext}
              onEnd={board.goEnd}
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
            activeVariation={variation.view}
            showBoardArrows={showBoardArrows}
            canAnalyze={validation.ok}
            onDepthChange={setDepth}
            onMultipvChange={setMultipv}
            onAnalyze={board.analyzeNow}
            onStop={live.stop}
            onToggleBoardArrows={board.toggleArrows}
            onSelectLine={board.previewLine}
            onStepVariation={variation.step}
            onExitVariation={variation.exit}
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
            onModeChange={board.changeSetupMode}
            onSelectionChange={setPaletteSelection}
            onFenInputChange={setFenInput}
            onLoadFen={board.loadFen}
            onMetaChange={board.changeMeta}
            onReset={board.resetToStart}
            onClear={board.clearBoard}
            onFlip={flipBoard}
            onCopyFen={() => void clipboard.copy(fen, "FEN")}
          />

          <MovePanel
            tree={tree}
            pgn={pgn}
            pgnInput={pgnInput}
            onPgnInputChange={setPgnInput}
            onLoadPgn={board.loadPgn}
            onCopyPgn={() => void clipboard.copy(pgn, "PGN")}
            onGoTo={board.goToNode}
            onPromote={board.promoteLine}
            onDelete={board.deleteLine}
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
