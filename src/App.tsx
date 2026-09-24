import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Color, type Move, type Piece, type Square } from "chess.js";
import { Activity, Crown } from "lucide-react";
import { AnalysisPanel, type ActiveVariationView } from "./components/AnalysisPanel";
import { AppearancePanel } from "./components/AppearancePanel";
import { ChessBoard, type BoardArrow } from "./components/ChessBoard";
import { EvalBar } from "./components/EvalBar";
import { GameNavBar } from "./components/GameNavBar";
import { GameStatusBanner, type GameStatus } from "./components/GameStatusBanner";
import type { EvalPoint } from "./components/EvalGraph";
import { MovePanel, type ReviewView } from "./components/MovePanel";
import { PromotionOverlay } from "./components/PromotionOverlay";
import { SetupPanel, type PaletteSelection } from "./components/SetupPanel";
import {
  EMPTY_FEN,
  START_FEN,
  buildFen,
  clonePosition,
  parseFen,
  validatePositionFen,
  type PositionState
} from "./lib/position";
import { StockfishClient, type AnalysisUpdate } from "./lib/analysis";
import type { AnalysisLine } from "./lib/analysis";
import { moveFromUci } from "./lib/position";
import {
  applyMove,
  canStepBackward,
  canStepForward,
  createTree,
  currentFen,
  currentLastMove,
  currentNode,
  deleteFrom,
  goTo,
  mainlineNodes,
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
} from "./lib/gameTree";
import { evaluatePositions, REVIEW_PRESETS, type ReviewPreset } from "./lib/gameAnalysis";
import { nagForJudgement } from "./lib/nags";
import {
  buildReview,
  judgeMove,
  povValue,
  winPercent,
  type GameReview,
  type PositionEval
} from "./lib/review";
import { cueForMove, playSound } from "./lib/sound";
import {
  normalizeBoardTheme,
  normalizePieceTheme,
  type BoardTheme,
  type PieceTheme
} from "./lib/themes";

type ActiveVariation = {
  sourceFen: string;
  multipv: number;
  uciMoves: string[];
  ply: number;
};

type PendingPromotion = { from: Square; to: Square; color: Color };

function readStoredBoardTheme(): BoardTheme {
  if (typeof window === "undefined") return "tournament";
  return normalizeBoardTheme(window.localStorage.getItem("chess-board-theme"));
}

function readStoredPieceTheme(): PieceTheme {
  if (typeof window === "undefined") return "modern";
  return normalizePieceTheme(window.localStorage.getItem("chess-piece-theme"));
}

function readStoredSound(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem("chess-sound") !== "off";
}

function buildPgn(tree: GameTree): string {
  try {
    const chess = new Chess(tree.rootFen);
    for (const san of mainlineSan(tree)) chess.move(san);
    return chess.pgn({ newline: "\n" });
  } catch {
    return "";
  }
}

type ReviewState = {
  review: GameReview;
  evals: Map<string, PositionEval>;
  cancelled: boolean;
  total: number;
};

function sideToMove(fen: string): "w" | "b" {
  return fen.split(/\s+/)[1] === "b" ? "b" : "w";
}

function whiteWinPercent(evaluation: PositionEval | undefined, fen: string): number | null {
  if (!evaluation) return null;
  return winPercent(povValue(evaluation.score, sideToMove(fen), "w"));
}

export default function App() {
  const [position, setPosition] = useState<PositionState>(() => parseFen(START_FEN));
  const [tree, setTree] = useState<GameTree>(() => createTree(START_FEN));
  const [setupMode, setSetupMode] = useState(false);
  const [orientation, setOrientation] = useState<"w" | "b">("w");
  const [paletteSelection, setPaletteSelection] = useState<PaletteSelection>({
    color: "w",
    type: "p"
  });
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [fenInput, setFenInput] = useState(START_FEN);
  const [pgnInput, setPgnInput] = useState("");
  const [depth, setDepth] = useState(14);
  const [multipv, setMultipv] = useState(3);
  const [boardTheme, setBoardTheme] = useState<BoardTheme>(() => readStoredBoardTheme());
  const [pieceTheme, setPieceTheme] = useState<PieceTheme>(() => readStoredPieceTheme());
  const [soundOn, setSoundOn] = useState<boolean>(() => readStoredSound());
  const [analysis, setAnalysis] = useState<AnalysisUpdate>({ status: "idle", lines: [] });
  const [activeVariation, setActiveVariation] = useState<ActiveVariation | null>(null);
  const [showBoardArrows, setShowBoardArrows] = useState(false);
  const [analyzingGame, setAnalyzingGame] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<{ done: number; total: number } | null>(null);
  const [reviewState, setReviewState] = useState<ReviewState | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewPreset, setReviewPreset] = useState<ReviewPreset>("standard");
  const engineRef = useRef<StockfishClient | null>(null);
  const evalCacheRef = useRef<Map<string, PositionEval>>(new Map());
  const analyzeCancelRef = useRef(false);

  const baseFen = useMemo(() => buildFen(position), [position]);
  const treeFen = useMemo(() => currentFen(tree), [tree]);
  const fen = setupMode ? baseFen : treeFen;
  const validation = useMemo(() => validatePositionFen(fen), [fen]);

  // Engine updates name the position they belong to; anything for another
  // position is stale (e.g. the board moved on before the engine caught up).
  const liveAnalysis = useMemo<AnalysisUpdate>(
    () => (analysis.fen && analysis.fen !== fen ? { status: "loading", lines: [] } : analysis),
    [analysis, fen]
  );

  const game = useMemo(() => {
    if (setupMode || !validation.ok) return null;
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }, [fen, validation.ok, setupMode]);

  const treePosition = useMemo(() => parseFen(treeFen), [treeFen]);

  const variationPreview = useMemo(() => {
    if (!activeVariation) return null;
    try {
      const preview = new Chess(activeVariation.sourceFen);
      const playedSans: string[] = [];
      let previewLastMove: { from: Square; to: Square } | null = null;
      for (let index = 0; index < activeVariation.ply; index += 1) {
        const uciMove = activeVariation.uciMoves[index];
        if (!uciMove) break;
        const made = moveFromUci(preview, uciMove);
        playedSans.push(made.san);
        previewLastMove = { from: made.from, to: made.to };
      }
      return { position: parseFen(preview.fen()), fen: preview.fen(), lastMove: previewLastMove, playedSans };
    } catch {
      return null;
    }
  }, [activeVariation]);

  const displayPosition = variationPreview?.position ?? (setupMode ? position : treePosition);
  const displayLastMove =
    variationPreview?.lastMove ?? (setupMode ? null : currentLastMove(tree));
  const displayFen = variationPreview?.fen ?? fen;

  const gameStatus = useMemo<GameStatus | null>(() => {
    if (setupMode) return null;
    let chess: Chess;
    try {
      chess = new Chess(displayFen);
    } catch {
      return null;
    }
    if (chess.isCheckmate()) return { type: "checkmate", winner: chess.turn() === "w" ? "b" : "w" };
    if (chess.isStalemate()) return { type: "stalemate" };
    if (chess.isInsufficientMaterial()) return { type: "draw", reason: "Insufficient material" };
    if (chess.isThreefoldRepetition()) return { type: "draw", reason: "Threefold repetition" };
    if (chess.isDraw()) return { type: "draw", reason: "Fifty-move rule" };
    if (chess.isCheck()) return { type: "check" };
    return null;
  }, [displayFen, setupMode]);

  const legalTargets = useMemo(() => {
    if (!game || !selectedSquare || setupMode || activeVariation) return [];
    return (game.moves({ square: selectedSquare, verbose: true }) as Move[]).map((move) => move.to);
  }, [activeVariation, game, selectedSquare, setupMode]);

  const arrows = useMemo<BoardArrow[]>(() => {
    if (activeVariation) {
      const index = Math.max(0, Math.min(activeVariation.ply - 1, activeVariation.uciMoves.length - 1));
      const move = activeVariation.uciMoves[index];
      if (!move || move.length < 4) return [];
      return [{ from: move.slice(0, 2) as Square, to: move.slice(2, 4) as Square, tone: "best" }];
    }
    if (!showBoardArrows) return [];
    return liveAnalysis.lines
      .map((line, index) => {
        const move = line.uciMoves[0];
        if (!move || move.length < 4) return null;
        return {
          from: move.slice(0, 2) as Square,
          to: move.slice(2, 4) as Square,
          tone: index === 0 ? "best" : "line"
        } satisfies BoardArrow;
      })
      .filter((arrow): arrow is BoardArrow => Boolean(arrow));
  }, [activeVariation, liveAnalysis.lines, showBoardArrows]);

  const activeVariationView = useMemo<ActiveVariationView | null>(() => {
    if (!activeVariation) return null;
    return {
      multipv: activeVariation.multipv,
      ply: activeVariation.ply,
      total: activeVariation.uciMoves.length
    };
  }, [activeVariation]);

  const pgn = useMemo(() => buildPgn(tree), [tree]);
  const ply = useMemo(() => nodePath(tree, tree.currentId).length, [tree]);
  const total = useMemo(() => nodePath(tree, toEnd(tree).currentId).length, [tree]);

  useEffect(() => {
    setFenInput(fen);
  }, [fen]);

  useEffect(() => {
    setPgnInput(pgn);
  }, [pgn]);

  useEffect(() => {
    engineRef.current = new StockfishClient(setAnalysis);
    return () => engineRef.current?.dispose();
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    if (analyzingGame) {
      engine.stop({ emit: false });
      return;
    }

    if (!validation.ok) {
      engine.stop({ emit: false });
      setAnalysis({ status: "error", lines: [], message: validation.error || "Invalid position" });
      return;
    }

    setAnalysis({ status: "loading", lines: [] });
    const timer = window.setTimeout(() => {
      engine.analyze(fen, { depth, multipv });
    }, 350);

    return () => {
      window.clearTimeout(timer);
      engine.stop({ emit: false });
    };
  }, [analyzingGame, depth, fen, multipv, validation.error, validation.ok]);

  useEffect(() => {
    setShowBoardArrows(false);
  }, [fen]);

  useEffect(() => {
    window.localStorage.setItem("chess-board-theme", boardTheme);
  }, [boardTheme]);

  useEffect(() => {
    window.localStorage.setItem("chess-piece-theme", pieceTheme);
  }, [pieceTheme]);

  useEffect(() => {
    window.localStorage.setItem("chess-sound", soundOn ? "on" : "off");
  }, [soundOn]);

  // Best-effort move grading while exploring: when the engine settles on the
  // board position, cache its eval and grade the move that led here against
  // its parent. Moves graded by a full game review keep that verdict.
  useEffect(() => {
    if (setupMode || analyzingGame) return;
    if (analysis.status !== "ready" || analysis.fen !== fen) return;
    const top = analysis.lines[0];
    if (!top) return;

    const evaluation: PositionEval = {
      score: top.score,
      depth: top.depth,
      ...((analysis.bestMove ?? top.uciMoves[0]) ? { bestMove: analysis.bestMove ?? top.uciMoves[0] } : {})
    };
    evalCacheRef.current.set(fen, evaluation);

    const node = currentNode(tree);
    if (!node || reviewState?.review.moves[node.id]) return;
    const parentFen = node.parentId ? tree.nodes[node.parentId]?.fen ?? tree.rootFen : tree.rootFen;
    const parent = evalCacheRef.current.get(parentFen);
    if (!parent) return;

    const { judgement } = judgeMove({ mover: node.color, before: parent, after: evaluation, playedUci: node.uci });
    const nag = nagForJudgement(judgement);
    if (node.nag !== nag) setTree((current) => setNag(current, node.id, nag));
  }, [analysis, fen, setupMode, analyzingGame, tree, reviewState]);

  const resetTreeTo = useCallback((rootFen: string) => {
    setTree(createTree(rootFen));
    setActiveVariation(null);
    setSelectedSquare(null);
    setAnalysis({ status: "idle", lines: [] });
    setReviewState(null);
    setReviewError(null);
  }, []);

  const navigate = useCallback((fn: (tree: GameTree) => GameTree) => {
    setTree((current) => fn(current));
    setActiveVariation(null);
    setSelectedSquare(null);
  }, []);

  const goStart = useCallback(() => navigate(toStart), [navigate]);
  const goPrev = useCallback(() => navigate(stepBackward), [navigate]);
  const goNext = useCallback(() => navigate(stepForward), [navigate]);
  const goEnd = useCallback(() => navigate(toEnd), [navigate]);
  const goToNode = useCallback((id: string | null) => navigate((current) => goTo(current, id)), [navigate]);
  const flipBoard = useCallback(() => setOrientation((current) => (current === "w" ? "b" : "w")), []);

  const playMove = useCallback(
    (from: Square, to: Square, promotion?: "q" | "r" | "b" | "n") => {
      if (setupMode || activeVariation) return;
      let chess: Chess;
      try {
        chess = new Chess(fen);
      } catch {
        return;
      }

      const moving = chess.get(from);
      if (!moving || moving.color !== chess.turn()) {
        setSelectedSquare(null);
        return;
      }

      const isLegal = (chess.moves({ square: from, verbose: true }) as Move[]).some(
        (move) => move.to === to
      );
      if (!isLegal) {
        setSelectedSquare(null);
        return;
      }

      const needsPromotion =
        moving.type === "p" &&
        ((moving.color === "w" && to[1] === "8") || (moving.color === "b" && to[1] === "1"));

      if (needsPromotion && !promotion) {
        setPendingPromotion({ from, to, color: moving.color });
        setSelectedSquare(null);
        return;
      }

      let made;
      try {
        made = chess.move({ from, to, promotion: promotion ?? "q" });
      } catch {
        setSelectedSquare(null);
        return;
      }
      if (!made) return;

      setTree((current) => applyMove(current, { from, to, promotion }));
      setSelectedSquare(null);
      setActiveVariation(null);
      setPendingPromotion(null);
      setAnalysis({ status: "idle", lines: [] });
      if (soundOn) playSound(cueForMove(made.san, made.flags));
    },
    [activeVariation, fen, setupMode, soundOn]
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (setupMode || pendingPromotion) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      } else if (event.key === "Home") {
        event.preventDefault();
        goStart();
      } else if (event.key === "End") {
        event.preventDefault();
        goEnd();
      } else if (event.key === "f" || event.key === "F") {
        flipBoard();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipBoard, goEnd, goNext, goPrev, goStart, pendingPromotion, setupMode]);

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
    if (piece && piece.color === game.turn()) {
      setSelectedSquare(square);
    } else {
      setSelectedSquare(null);
    }
  }

  function handleMetaChange(meta: PositionState["meta"]) {
    setPosition((current) => {
      const next = { ...current, meta };
      resetTreeTo(buildFen(next));
      return next;
    });
  }

  function handleSetupModeChange(active: boolean) {
    setSetupMode(active);
    setSelectedSquare(null);
    if (!active) resetTreeTo(buildFen(position));
  }

  function handleLoadFen() {
    const validationResult = validatePositionFen(fenInput);
    if (!validationResult.ok) {
      setAnalysis({ status: "error", lines: [], message: validationResult.error || "Invalid FEN" });
      return;
    }
    setPosition(parseFen(fenInput));
    resetTreeTo(fenInput);
  }

  function handleLoadPgn() {
    try {
      const { tree: loaded } = treeFromPgn(pgnInput);
      setPosition(parseFen(loaded.rootFen));
      setTree(loaded);
      setSelectedSquare(null);
      setActiveVariation(null);
      setAnalysis({ status: "idle", lines: [] });
      setReviewState(null);
      setReviewError(null);
    } catch (error) {
      setAnalysis({
        status: "error",
        lines: [],
        message: error instanceof Error ? error.message : "Invalid PGN"
      });
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
    setActiveVariation(null);
    setSelectedSquare(null);
    setShowBoardArrows(true);
    engineRef.current?.analyze(fen, { depth, multipv });
  }

  function handleToggleBoardArrows() {
    if (!validation.ok) return;
    if (!showBoardArrows && !liveAnalysis.lines.length) {
      engineRef.current?.analyze(fen, { depth, multipv });
    }
    setShowBoardArrows((current) => !current);
  }

  async function handleAnalyzeGame() {
    const nodes = mainlineNodes(tree);
    if (!nodes.length || analyzingGame) return;

    analyzeCancelRef.current = false;
    setAnalyzingGame(true);
    setActiveVariation(null);
    setReviewState(null);
    setReviewError(null);

    const moves = nodes.map((node) => ({
      id: node.id,
      color: node.color,
      uci: node.uci,
      fen: node.fen,
      parentFen: node.parentId ? tree.nodes[node.parentId]?.fen ?? tree.rootFen : tree.rootFen
    }));
    const fens = Array.from(new Set([tree.rootFen, ...nodes.map((node) => node.fen)]));
    setAnalyzeProgress({ done: 0, total: fens.length });

    try {
      const { evals, cancelled } = await evaluatePositions(fens, REVIEW_PRESETS[reviewPreset].nodes, {
        onProgress: (done, total) => setAnalyzeProgress({ done, total }),
        isCancelled: () => analyzeCancelRef.current
      });

      for (const [positionFen, evaluation] of evals) evalCacheRef.current.set(positionFen, evaluation);

      // Grade first, then apply NAGs in one pure updater (safe under StrictMode).
      const review = buildReview(moves, evals);
      setTree((current) => {
        let next = current;
        for (const move of Object.values(review.moves)) {
          next = setNag(next, move.nodeId, nagForJudgement(move.judgement));
        }
        return next;
      });
      setReviewState({ review, evals, cancelled, total: fens.length });
    } catch (error) {
      setReviewError(
        `Game review failed: ${error instanceof Error ? error.message : "the engine stopped working"}.`
      );
    } finally {
      setAnalyzeProgress(null);
      setAnalyzingGame(false);
    }
  }

  function handleCancelAnalyzeGame() {
    analyzeCancelRef.current = true;
  }

  function handleSelectVariation(line: AnalysisLine, plyIndex: number) {
    if (!line.uciMoves.length || !validation.ok) return;
    setSelectedSquare(null);
    setActiveVariation({
      sourceFen: fen,
      multipv: line.multipv,
      uciMoves: line.uciMoves,
      ply: Math.max(1, Math.min(plyIndex, line.uciMoves.length))
    });
  }

  function handleStepVariation(direction: -1 | 1) {
    setActiveVariation((current) => {
      if (!current) return current;
      return {
        ...current,
        ply: Math.max(0, Math.min(current.uciMoves.length, current.ply + direction))
      };
    });
  }

  function copyText(value: string) {
    void navigator.clipboard?.writeText(value);
  }

  const reviewView = useMemo<ReviewView | null>(() => {
    if (!reviewState) return null;
    const { review, evals, cancelled, total } = reviewState;
    const points: EvalPoint[] = [
      { id: null, label: "Start", whiteWin: whiteWinPercent(evals.get(tree.rootFen), tree.rootFen) },
      ...mainlineNodes(tree).map((node) => ({
        id: node.id,
        label: `${node.moveNumber}${node.color === "w" ? "." : "…"} ${node.san}`,
        whiteWin: whiteWinPercent(evals.get(node.fen), node.fen),
        ...(review.moves[node.id] ? { judgement: review.moves[node.id].judgement } : {})
      }))
    ];
    return { review, points, cancelled, evaluated: evals.size, total };
  }, [reviewState, tree]);

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
            <div className="preview-banner">
              <div>
                <span>Previewing line {activeVariation.multipv}</span>
                <strong>
                  {activeVariation.ply} / {activeVariation.uciMoves.length}
                </strong>
              </div>
              <p>{variationPreview?.playedSans.join(" ") || "Current position"}</p>
            </div>
          ) : null}
          <div className="board-with-eval">
            <EvalBar fen={fen} line={liveAnalysis.lines[0]} status={liveAnalysis.status} />
            <div className="board-column">
              <ChessBoard
                board={displayPosition.board}
                orientation={orientation}
                boardTheme={boardTheme}
                pieceTheme={pieceTheme}
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
                  pieceTheme={pieceTheme}
                  onSelect={(piece) =>
                    playMove(pendingPromotion.from, pendingPromotion.to, piece)
                  }
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
            onStop={() => engineRef.current?.stop()}
            onToggleBoardArrows={handleToggleBoardArrows}
            onSelectLine={handleSelectVariation}
            onStepVariation={handleStepVariation}
            onExitVariation={() => setActiveVariation(null)}
          />

          <AppearancePanel
            boardTheme={boardTheme}
            pieceTheme={pieceTheme}
            soundOn={soundOn}
            onBoardThemeChange={setBoardTheme}
            onPieceThemeChange={setPieceTheme}
            onSoundChange={setSoundOn}
          />

          <SetupPanel
            active={setupMode}
            selection={paletteSelection}
            meta={position.meta}
            fen={fen}
            fenInput={fenInput}
            validation={validation}
            pieceTheme={pieceTheme}
            onModeChange={handleSetupModeChange}
            onSelectionChange={(selection: Piece | "erase") => setPaletteSelection(selection)}
            onFenInputChange={setFenInput}
            onLoadFen={handleLoadFen}
            onMetaChange={handleMetaChange}
            onReset={handleReset}
            onClear={handleClear}
            onFlip={flipBoard}
            onCopyFen={() => copyText(fen)}
          />

          <MovePanel
            tree={tree}
            pgn={pgn}
            pgnInput={pgnInput}
            onPgnInputChange={setPgnInput}
            onLoadPgn={handleLoadPgn}
            onCopyPgn={() => copyText(pgn)}
            onGoTo={goToNode}
            onPromote={(id) => setTree((current) => promoteToMainline(current, id))}
            onDelete={(id) => {
              setTree((current) => deleteFrom(current, id));
              setActiveVariation(null);
              setSelectedSquare(null);
            }}
            onAnalyzeGame={handleAnalyzeGame}
            onCancelAnalyzeGame={handleCancelAnalyzeGame}
            analyzing={analyzingGame}
            analyzeProgress={analyzeProgress}
            reviewView={reviewView}
            reviewError={reviewError}
            reviewPreset={reviewPreset}
            onReviewPresetChange={setReviewPreset}
            canAnalyzeGame={tree.rootChildren.length > 0}
          />
        </aside>
      </div>
    </main>
  );
}
