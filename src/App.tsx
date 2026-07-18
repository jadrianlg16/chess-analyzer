import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Color, type Move, type Piece, type Square } from "chess.js";
import { Activity, Crown } from "lucide-react";
import { AnalysisPanel, type ActiveVariationView } from "./components/AnalysisPanel";
import { AppearancePanel } from "./components/AppearancePanel";
import { ChessBoard, type BoardArrow } from "./components/ChessBoard";
import { EvalBar } from "./components/EvalBar";
import { GameNavBar } from "./components/GameNavBar";
import { GameStatusBanner, type GameStatus } from "./components/GameStatusBanner";
import { MovePanel, type GameAnalysisSummary } from "./components/MovePanel";
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
import { evaluateFens } from "./lib/gameAnalysis";
import { scoreToWhitePerspective } from "./lib/evaluation";
import { classifyByLoss, NAG_BY_QUALITY } from "./lib/nags";
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

function whiteCp(score: AnalysisLine["score"], fen: string): number {
  const white = scoreToWhitePerspective(score, fen);
  if (white.kind === "mate") return white.value >= 0 ? 100000 : -100000;
  return white.value;
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
  const [analyzeSummary, setAnalyzeSummary] = useState<GameAnalysisSummary | null>(null);
  const engineRef = useRef<StockfishClient | null>(null);
  const evalCacheRef = useRef<Map<string, number>>(new Map());
  const analyzeCancelRef = useRef(false);

  const baseFen = useMemo(() => buildFen(position), [position]);
  const treeFen = useMemo(() => currentFen(tree), [tree]);
  const fen = setupMode ? baseFen : treeFen;
  const validation = useMemo(() => validatePositionFen(fen), [fen]);

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
    return analysis.lines
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
  }, [activeVariation, analysis.lines, showBoardArrows]);

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

  // Best-effort move-quality annotation: when the engine settles on a position,
  // cache its eval and grade the move that produced it against its parent.
  useEffect(() => {
    if (setupMode || analyzingGame) return;
    if (analysis.status !== "ready" && analysis.status !== "fallback") return;
    const top = analysis.lines[0];
    if (!top) return;

    const cp = whiteCp(top.score, fen);
    evalCacheRef.current.set(fen, cp);

    const node = currentNode(tree);
    if (!node) return;
    const parentFen = node.parentId ? tree.nodes[node.parentId]?.fen ?? tree.rootFen : tree.rootFen;
    const parentCp = evalCacheRef.current.get(parentFen);
    if (parentCp === undefined) return;

    // Clamp to ±10 pawns before comparing: a winning position that stays
    // winning (or a mate that becomes a faster mate) is not a mistake, and this
    // keeps mate scores from swamping the heuristic.
    const clamp = (value: number) => Math.max(-1000, Math.min(1000, value));
    const moverSign = node.color === "w" ? 1 : -1;
    const loss = moverSign * (clamp(parentCp) - clamp(cp));
    const nag = classifyByLoss(loss);
    if (node.nag !== nag) setTree((current) => setNag(current, node.id, nag));
  }, [analysis.status, analysis.lines, fen, setupMode, analyzingGame, tree]);

  const resetTreeTo = useCallback((rootFen: string) => {
    setTree(createTree(rootFen));
    setActiveVariation(null);
    setSelectedSquare(null);
    setAnalysis({ status: "idle", lines: [] });
    setAnalyzeSummary(null);
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
      setAnalyzeSummary(null);
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
    if (!showBoardArrows && !analysis.lines.length) {
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
    setAnalyzeSummary(null);

    const fenByNode = new Map(nodes.map((node) => [node.id, node.fen] as const));
    const parentFenByNode = new Map(
      nodes.map(
        (node) =>
          [node.id, node.parentId ? tree.nodes[node.parentId]?.fen ?? tree.rootFen : tree.rootFen] as const
      )
    );
    const fens = Array.from(new Set([tree.rootFen, ...nodes.map((node) => node.fen)]));

    setAnalyzeProgress({ done: 0, total: fens.length });

    const evals = await evaluateFens(
      fens,
      depth,
      (done, total) => setAnalyzeProgress({ done, total }),
      () => analyzeCancelRef.current
    );

    for (const [fenString, score] of evals) {
      evalCacheRef.current.set(fenString, whiteCp(score, fenString));
    }

    // Compute classifications purely first (no side effects), so the setTree
    // updater stays pure and StrictMode's double-invoke can't double-count.
    const clamp = (value: number) => Math.max(-1000, Math.min(1000, value));
    const summary: GameAnalysisSummary = { blunders: 0, mistakes: 0, inaccuracies: 0 };
    const nagUpdates: { id: string; nag: number | undefined }[] = [];

    for (const node of nodes) {
      const nodeFen = fenByNode.get(node.id)!;
      const parentFen = parentFenByNode.get(node.id)!;
      const childScore = evals.get(nodeFen);
      const parentScore = evals.get(parentFen);
      if (!childScore || !parentScore) continue;

      const moverSign = node.color === "w" ? 1 : -1;
      const loss = moverSign * (clamp(whiteCp(parentScore, parentFen)) - clamp(whiteCp(childScore, nodeFen)));
      const nag = classifyByLoss(loss);
      nagUpdates.push({ id: node.id, nag });

      if (nag === NAG_BY_QUALITY.blunder) summary.blunders += 1;
      else if (nag === NAG_BY_QUALITY.mistake) summary.mistakes += 1;
      else if (nag === NAG_BY_QUALITY.inaccuracy) summary.inaccuracies += 1;
    }

    setTree((current) => {
      let next = current;
      for (const update of nagUpdates) next = setNag(next, update.id, update.nag);
      return next;
    });

    setAnalyzeSummary(summary);
    setAnalyzeProgress(null);
    setAnalyzingGame(false);
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
            <EvalBar fen={fen} line={analysis.lines[0]} status={analysis.status} />
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
            status={analysis.status}
            lines={analysis.lines}
            bestMove={analysis.bestMove}
            message={analysis.message}
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
            analyzeSummary={analyzeSummary}
            canAnalyzeGame={tree.rootChildren.length > 0}
          />
        </aside>
      </div>
    </main>
  );
}
