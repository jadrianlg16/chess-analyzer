import {
  Download,
  Eraser,
  FlipVertical2,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import "../styles/analyzer.css";

export type PieceColor = "w" | "b";
export type PieceRole = "k" | "q" | "r" | "b" | "n" | "p";
export type PieceCode = `${PieceColor}${PieceRole}`;

export interface BoardPiece {
  square: string;
  piece: PieceCode;
}

export interface EngineLine {
  id: string;
  depth: number;
  score: string;
  moves: string;
  isBest?: boolean;
}

export interface MoveRecord {
  ply: number;
  white?: string;
  black?: string;
  annotation?: string;
}

export interface AnalyzerSurfaceProps {
  position?: BoardPiece[];
  orientation?: PieceColor;
  activeSquare?: string;
  candidateSquares?: string[];
  fen?: string;
  pgn?: string;
  engineLines?: EngineLine[];
  moves?: MoveRecord[];
  onFenChange?: (fen: string) => void;
  onPgnChange?: (pgn: string) => void;
  onImportFen?: (fen: string) => void;
  onImportPgn?: (pgn: string) => void;
  onExportFen?: () => void;
  onExportPgn?: () => void;
  onSquareClick?: (square: string) => void;
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"];

const PIECE_GLYPHS: Record<PieceCode, string> = {
  wk: "\u2654",
  wq: "\u2655",
  wr: "\u2656",
  wb: "\u2657",
  wn: "\u2658",
  wp: "\u2659",
  bk: "\u265a",
  bq: "\u265b",
  br: "\u265c",
  bb: "\u265d",
  bn: "\u265e",
  bp: "\u265f",
};

const STARTING_POSITION: BoardPiece[] = [
  { square: "a1", piece: "wr" },
  { square: "b1", piece: "wn" },
  { square: "c1", piece: "wb" },
  { square: "d1", piece: "wq" },
  { square: "e1", piece: "wk" },
  { square: "f1", piece: "wb" },
  { square: "g1", piece: "wn" },
  { square: "h1", piece: "wr" },
  { square: "a2", piece: "wp" },
  { square: "b2", piece: "wp" },
  { square: "c2", piece: "wp" },
  { square: "d2", piece: "wp" },
  { square: "e2", piece: "wp" },
  { square: "f2", piece: "wp" },
  { square: "g2", piece: "wp" },
  { square: "h2", piece: "wp" },
  { square: "a7", piece: "bp" },
  { square: "b7", piece: "bp" },
  { square: "c7", piece: "bp" },
  { square: "d7", piece: "bp" },
  { square: "e7", piece: "bp" },
  { square: "f7", piece: "bp" },
  { square: "g7", piece: "bp" },
  { square: "h7", piece: "bp" },
  { square: "a8", piece: "br" },
  { square: "b8", piece: "bn" },
  { square: "c8", piece: "bb" },
  { square: "d8", piece: "bq" },
  { square: "e8", piece: "bk" },
  { square: "f8", piece: "bb" },
  { square: "g8", piece: "bn" },
  { square: "h8", piece: "br" },
];

const SAMPLE_ENGINE_LINES: EngineLine[] = [
  {
    id: "line-1",
    depth: 18,
    score: "+0.34",
    moves: "Nf3 d5 d4 Nf6 c4 e6 Nc3",
    isBest: true,
  },
  {
    id: "line-2",
    depth: 18,
    score: "+0.18",
    moves: "c4 e5 Nc3 Nf6 g3 Bb4",
  },
  {
    id: "line-3",
    depth: 17,
    score: "0.00",
    moves: "e4 e5 Nf3 Nc6 Bb5 a6",
  },
];

const SAMPLE_MOVES: MoveRecord[] = [
  { ply: 1, white: "e4", black: "e5" },
  { ply: 2, white: "Nf3", black: "Nc6" },
  { ply: 3, white: "Bb5", black: "a6", annotation: "Book" },
  { ply: 4, white: "Ba4", black: "Nf6" },
];

const DEFAULT_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const DEFAULT_PGN = `[Event "Analysis"]
[Site "Local"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *`;

export function AnalyzerSurface({
  position = STARTING_POSITION,
  orientation = "w",
  activeSquare = "e4",
  candidateSquares = ["e5", "f5", "d5"],
  fen = DEFAULT_FEN,
  pgn = DEFAULT_PGN,
  engineLines = SAMPLE_ENGINE_LINES,
  moves = SAMPLE_MOVES,
  onFenChange,
  onPgnChange,
  onImportFen,
  onImportPgn,
  onExportFen,
  onExportPgn,
  onSquareClick,
}: AnalyzerSurfaceProps) {
  const [mode, setMode] = useState<"analysis" | "setup">("analysis");
  const [localPosition, setLocalPosition] = useState(position);
  const [localFen, setLocalFen] = useState(fen);
  const [localPgn, setLocalPgn] = useState(pgn);
  const [boardOrientation, setBoardOrientation] = useState<PieceColor>(orientation);
  const [selectedSetupPiece, setSelectedSetupPiece] = useState<PieceCode | "erase">(
    "wp",
  );

  useEffect(() => {
    setLocalPosition(position);
  }, [position]);

  useEffect(() => {
    setLocalFen(fen);
  }, [fen]);

  useEffect(() => {
    setLocalPgn(pgn);
  }, [pgn]);

  useEffect(() => {
    setBoardOrientation(orientation);
  }, [orientation]);

  const handleFenChange = (nextFen: string) => {
    setLocalFen(nextFen);
    onFenChange?.(nextFen);
  };

  const handlePgnChange = (nextPgn: string) => {
    setLocalPgn(nextPgn);
    onPgnChange?.(nextPgn);
  };

  const handleSquareClick = (square: string) => {
    if (mode !== "setup") {
      onSquareClick?.(square);
      return;
    }

    setLocalPosition((currentPosition) => {
      const remainingPieces = currentPosition.filter((entry) => entry.square !== square);

      if (selectedSetupPiece === "erase") {
        return remainingPieces;
      }

      return [...remainingPieces, { square, piece: selectedSetupPiece }];
    });

    onSquareClick?.(square);
  };

  return (
    <section className="analyzer-shell" aria-label="Chess analysis workspace">
      <div className="analyzer-toolbar" aria-label="Analysis controls">
        <div className="segmented-control" role="tablist" aria-label="Workspace mode">
          <button
            type="button"
            className={mode === "analysis" ? "is-active" : ""}
            aria-selected={mode === "analysis"}
            role="tab"
            onClick={() => setMode("analysis")}
          >
            Analysis
          </button>
          <button
            type="button"
            className={mode === "setup" ? "is-active" : ""}
            aria-selected={mode === "setup"}
            role="tab"
            onClick={() => setMode("setup")}
          >
            Setup
          </button>
        </div>
        <div className="toolbar-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="Flip board"
            title="Flip board"
            onClick={() => setBoardOrientation(boardOrientation === "w" ? "b" : "w")}
          >
            <FlipVertical2 aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Reset to starting position"
            title="Reset to starting position"
            onClick={() => {
              setLocalPosition(STARTING_POSITION);
              handleFenChange(DEFAULT_FEN);
            }}
          >
            <RotateCcw aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Clear board"
            title="Clear board"
            onClick={() => {
              setLocalPosition([]);
              handleFenChange("8/8/8/8/8/8/8/8 w - - 0 1");
            }}
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="analyzer-layout">
        <main className="board-column">
          <AnalyzerBoard
            activeSquare={activeSquare}
            candidateSquares={candidateSquares}
            orientation={boardOrientation}
            position={localPosition}
            onSquareClick={handleSquareClick}
          />
          <ImportExportPanel
            fen={localFen}
            pgn={localPgn}
            onFenChange={handleFenChange}
            onPgnChange={handlePgnChange}
            onImportFen={() => onImportFen?.(localFen)}
            onImportPgn={() => onImportPgn?.(localPgn)}
            onExportFen={onExportFen}
            onExportPgn={onExportPgn}
          />
        </main>

        <aside className="analysis-column" aria-label="Analysis panels">
          <SetupPanel
            mode={mode}
            selectedPiece={selectedSetupPiece}
            onSelectPiece={setSelectedSetupPiece}
          />
          <EngineLinesPanel lines={engineLines} />
          <MoveList moves={moves} />
        </aside>
      </div>
    </section>
  );
}

interface AnalyzerBoardProps {
  position: BoardPiece[];
  orientation: PieceColor;
  activeSquare?: string;
  candidateSquares?: string[];
  onSquareClick?: (square: string) => void;
}

function AnalyzerBoard({
  position,
  orientation,
  activeSquare,
  candidateSquares = [],
  onSquareClick,
}: AnalyzerBoardProps) {
  const piecesBySquare = useMemo(
    () => new Map(position.map((entry) => [entry.square, entry.piece])),
    [position],
  );
  const candidateSet = useMemo(() => new Set(candidateSquares), [candidateSquares]);
  const ranks = orientation === "w" ? [...RANKS].reverse() : RANKS;
  const files = orientation === "w" ? FILES : [...FILES].reverse();

  return (
    <div className="board-wrap">
      <div className="eval-strip" aria-label="Evaluation bar">
        <div className="eval-strip-fill" style={{ height: "54%" }} />
      </div>
      <div className="board-grid" role="grid" aria-label="Chess board">
        {ranks.flatMap((rank, rankIndex) =>
          files.map((file, fileIndex) => {
            const square = `${file}${rank}`;
            const isLight = (rankIndex + fileIndex) % 2 === 0;
            const piece = piecesBySquare.get(square);
            const isActive = activeSquare === square;
            const isCandidate = candidateSet.has(square);

            return (
              <button
                type="button"
                key={square}
                className={[
                  "board-square",
                  isLight ? "is-light" : "is-dark",
                  isActive ? "is-active" : "",
                  isCandidate ? "is-candidate" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                role="gridcell"
                aria-label={`${square}${piece ? ` ${piece}` : ""}`}
                onClick={() => onSquareClick?.(square)}
              >
                {fileIndex === 0 ? <span className="rank-label">{rank}</span> : null}
                {rankIndex === ranks.length - 1 ? (
                  <span className="file-label">{file}</span>
                ) : null}
                {piece ? <span className="piece">{PIECE_GLYPHS[piece]}</span> : null}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}

interface SetupPanelProps {
  mode: "analysis" | "setup";
  selectedPiece: PieceCode | "erase";
  onSelectPiece: (piece: PieceCode | "erase") => void;
}

function SetupPanel({ mode, selectedPiece, onSelectPiece }: SetupPanelProps) {
  const pieces: Array<{ code: PieceCode; label: string }> = [
    { code: "wk", label: "White king" },
    { code: "wq", label: "White queen" },
    { code: "wr", label: "White rook" },
    { code: "wb", label: "White bishop" },
    { code: "wn", label: "White knight" },
    { code: "wp", label: "White pawn" },
    { code: "bk", label: "Black king" },
    { code: "bq", label: "Black queen" },
    { code: "br", label: "Black rook" },
    { code: "bb", label: "Black bishop" },
    { code: "bn", label: "Black knight" },
    { code: "bp", label: "Black pawn" },
  ];

  return (
    <section className="panel setup-panel" aria-label="Setup controls">
      <div className="panel-heading">
        <h2>Setup</h2>
        <span className="status-pill">{mode === "setup" ? "Editing" : "Ready"}</span>
      </div>
      <div className="setup-row">
        <label htmlFor="side-to-move">Side</label>
        <select id="side-to-move" defaultValue="w">
          <option value="w">White to move</option>
          <option value="b">Black to move</option>
        </select>
      </div>
      <div className="setup-row">
        <label htmlFor="castling-rights">Castling</label>
        <select id="castling-rights" defaultValue="KQkq">
          <option value="KQkq">Both sides</option>
          <option value="KQ">White only</option>
          <option value="kq">Black only</option>
          <option value="-">None</option>
        </select>
      </div>
      <div className="piece-tray" aria-label="Piece tray">
        {pieces.map((piece) => (
          <button
            type="button"
            key={piece.code}
            className={
              selectedPiece === piece.code
                ? "piece-tray-button is-selected"
                : "piece-tray-button"
            }
            aria-label={piece.label}
            aria-pressed={selectedPiece === piece.code}
            title={piece.label}
            onClick={() => onSelectPiece(piece.code)}
          >
            {PIECE_GLYPHS[piece.code]}
          </button>
        ))}
        <button
          type="button"
          className={
            selectedPiece === "erase" ? "piece-tray-button is-selected" : "piece-tray-button"
          }
          aria-label="Erase piece"
          aria-pressed={selectedPiece === "erase"}
          title="Erase piece"
          onClick={() => onSelectPiece("erase")}
        >
          <Eraser aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

interface ImportExportPanelProps {
  fen: string;
  pgn: string;
  onFenChange: (fen: string) => void;
  onPgnChange: (pgn: string) => void;
  onImportFen?: () => void;
  onImportPgn?: () => void;
  onExportFen?: () => void;
  onExportPgn?: () => void;
}

function ImportExportPanel({
  fen,
  pgn,
  onFenChange,
  onPgnChange,
  onImportFen,
  onImportPgn,
  onExportFen,
  onExportPgn,
}: ImportExportPanelProps) {
  return (
    <section className="panel import-export-panel" aria-label="Import and export">
      <div className="field-group">
        <div className="field-heading">
          <label htmlFor="fen-input">FEN</label>
          <div className="field-actions">
            <button
              type="button"
              aria-label="Import FEN"
              title="Import FEN"
              onClick={onImportFen}
            >
              <Upload aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Export FEN"
              title="Export FEN"
              onClick={onExportFen}
            >
              <Download aria-hidden="true" />
            </button>
          </div>
        </div>
        <input
          id="fen-input"
          value={fen}
          spellCheck={false}
          onChange={(event) => onFenChange(event.target.value)}
        />
      </div>
      <div className="field-group">
        <div className="field-heading">
          <label htmlFor="pgn-input">PGN</label>
          <div className="field-actions">
            <button
              type="button"
              aria-label="Import PGN"
              title="Import PGN"
              onClick={onImportPgn}
            >
              <Upload aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Export PGN"
              title="Export PGN"
              onClick={onExportPgn}
            >
              <Download aria-hidden="true" />
            </button>
          </div>
        </div>
        <textarea
          id="pgn-input"
          value={pgn}
          spellCheck={false}
          rows={4}
          onChange={(event) => onPgnChange(event.target.value)}
        />
      </div>
    </section>
  );
}

interface EngineLinesPanelProps {
  lines: EngineLine[];
}

function EngineLinesPanel({ lines }: EngineLinesPanelProps) {
  return (
    <section className="panel engine-panel" aria-label="Engine lines">
      <div className="panel-heading">
        <h2>Engine</h2>
        <span className="engine-state">Idle</span>
      </div>
      <div className="engine-lines">
        {lines.map((line) => (
          <article
            key={line.id}
            className={line.isBest ? "engine-line is-best" : "engine-line"}
          >
            <div className="engine-score">{line.score}</div>
            <div className="engine-variation">
              <div className="depth">Depth {line.depth}</div>
              <div className="variation-text">{line.moves}</div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

interface MoveListProps {
  moves: MoveRecord[];
}

function MoveList({ moves }: MoveListProps) {
  return (
    <section className="panel move-panel" aria-label="Move list">
      <div className="panel-heading">
        <h2>Moves</h2>
        <span className="move-count">{moves.length} turns</span>
      </div>
      <ol className="move-list">
        {moves.map((move) => (
          <li key={move.ply} className="move-row">
            <span className="move-number">{move.ply}.</span>
            <button type="button">{move.white ?? ""}</button>
            <button type="button">{move.black ?? ""}</button>
            {move.annotation ? <span className="annotation">{move.annotation}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
