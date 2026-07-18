import {
  Check,
  Clipboard,
  Eraser,
  FlipHorizontal2,
  RotateCcw,
  Trash2,
  Upload
} from "lucide-react";
import type { Color, Piece } from "chess.js";
import { pieceTypes, type CastlingRights, type PositionMeta } from "../lib/position";
import type { PieceTheme } from "../lib/themes";
import { CollapsiblePanel } from "./CollapsiblePanel";
import { PieceIcon } from "./PieceIcon";

export type PaletteSelection = Piece | "erase";

type SetupPanelProps = {
  active: boolean;
  selection: PaletteSelection;
  meta: PositionMeta;
  fen: string;
  fenInput: string;
  validation: { ok: boolean; error?: string };
  pieceTheme: PieceTheme;
  onModeChange: (setup: boolean) => void;
  onSelectionChange: (selection: PaletteSelection) => void;
  onFenInputChange: (fen: string) => void;
  onLoadFen: () => void;
  onMetaChange: (meta: PositionMeta) => void;
  onReset: () => void;
  onClear: () => void;
  onFlip: () => void;
  onCopyFen: () => void;
};

const colorLabels: Record<Color, string> = {
  w: "White",
  b: "Black"
};

export function SetupPanel({
  active,
  selection,
  meta,
  fen,
  fenInput,
  validation,
  pieceTheme,
  onModeChange,
  onSelectionChange,
  onFenInputChange,
  onLoadFen,
  onMetaChange,
  onReset,
  onClear,
  onFlip,
  onCopyFen
}: SetupPanelProps) {
  return (
    <CollapsiblePanel
      className="setup-panel"
      eyebrow="Position"
      title="Setup"
      defaultExpanded
      actions={
        <div className="segmented">
          <button className={!active ? "active" : ""} type="button" onClick={() => onModeChange(false)}>
            Moves
          </button>
          <button className={active ? "active" : ""} type="button" onClick={() => onModeChange(true)}>
            Setup
          </button>
        </div>
      }
    >

      <div className="toolbar">
        <button className="icon-button" type="button" title="Start position" onClick={onReset}>
          <RotateCcw size={18} />
        </button>
        <button className="icon-button" type="button" title="Clear board" onClick={onClear}>
          <Trash2 size={18} />
        </button>
        <button className="icon-button" type="button" title="Flip board" onClick={onFlip}>
          <FlipHorizontal2 size={18} />
        </button>
        <button className="icon-button" type="button" title="Copy FEN" onClick={onCopyFen}>
          <Clipboard size={18} />
        </button>
      </div>

      <div className="palette" aria-label="Piece palette">
        {(["w", "b"] as Color[]).map((color) => (
          <div className="palette-row" key={color}>
            <span className="palette-label">{colorLabels[color]}</span>
            {pieceTypes.map((type) => {
              const selected = selection !== "erase" && selection.color === color && selection.type === type;
              return (
                <button
                  key={`${color}${type}`}
                  className={`piece-pick piece-theme-${pieceTheme} ${selected ? "active" : ""}`}
                  type="button"
                  title={`${colorLabels[color]} ${type}`}
                  onClick={() => onSelectionChange({ color, type })}
                >
                  <span className="piece-pick-glyph">
                    <PieceIcon piece={{ color, type }} theme={pieceTheme} />
                  </span>
                </button>
              );
            })}
          </div>
        ))}
        <button
          className={`erase-pick ${selection === "erase" ? "active" : ""}`}
          type="button"
          onClick={() => onSelectionChange("erase")}
        >
          <Eraser size={17} />
          Erase
        </button>
      </div>

      <div className="field-grid">
        <label>
          Side
          <select value={meta.turn} onChange={(event) => onMetaChange({ ...meta, turn: event.target.value as Color })}>
            <option value="w">White</option>
            <option value="b">Black</option>
          </select>
        </label>
        <label>
          En passant
          <input
            value={meta.enPassant}
            onChange={(event) => onMetaChange({ ...meta, enPassant: event.target.value })}
            placeholder="-"
          />
        </label>
        <label>
          Halfmove
          <input
            min={0}
            type="number"
            value={meta.halfmove}
            onChange={(event) => onMetaChange({ ...meta, halfmove: Number(event.target.value) })}
          />
        </label>
        <label>
          Fullmove
          <input
            min={1}
            type="number"
            value={meta.fullmove}
            onChange={(event) => onMetaChange({ ...meta, fullmove: Number(event.target.value) })}
          />
        </label>
      </div>

      <div className="castling-row">
        {(["K", "Q", "k", "q"] as (keyof CastlingRights)[]).map((right) => (
          <label key={right}>
            <input
              type="checkbox"
              checked={meta.castling[right]}
              onChange={(event) =>
                onMetaChange({
                  ...meta,
                  castling: { ...meta.castling, [right]: event.target.checked }
                })
              }
            />
            {right}
          </label>
        ))}
      </div>

      <label className="textarea-field">
        FEN
        <textarea value={fenInput} onChange={(event) => onFenInputChange(event.target.value)} rows={3} />
      </label>
      <div className="split-actions">
        <button className="primary-button" type="button" onClick={onLoadFen}>
          <Upload size={16} />
          Load FEN
        </button>
        <span className={`fen-status ${validation.ok ? "ok" : "bad"}`}>
          <Check size={15} />
          {validation.ok ? "Valid" : validation.error || "Invalid"}
        </span>
      </div>
      <input className="copy-source" readOnly value={fen} aria-label="Current FEN" />
    </CollapsiblePanel>
  );
}
