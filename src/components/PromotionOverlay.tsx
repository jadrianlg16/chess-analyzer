import type { Color, PieceSymbol } from "chess.js";
import type { PieceTheme } from "../lib/themes";
import { PieceIcon } from "./PieceIcon";

type PromotionOverlayProps = {
  color: Color;
  pieceTheme: PieceTheme;
  onSelect: (piece: "q" | "r" | "b" | "n") => void;
  onCancel: () => void;
};

const CHOICES: ("q" | "r" | "b" | "n")[] = ["q", "r", "b", "n"];

export function PromotionOverlay({ color, pieceTheme, onSelect, onCancel }: PromotionOverlayProps) {
  return (
    <div className="promotion-overlay" role="dialog" aria-label="Choose promotion piece" onClick={onCancel}>
      <div className="promotion-card" onClick={(event) => event.stopPropagation()}>
        <span className="promotion-title">Promote to</span>
        <div className="promotion-choices">
          {CHOICES.map((type) => (
            <button
              key={type}
              type="button"
              className="promotion-choice"
              title={type.toUpperCase()}
              onClick={() => onSelect(type)}
            >
              <PieceIcon piece={{ color, type: type as PieceSymbol }} theme={pieceTheme} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
