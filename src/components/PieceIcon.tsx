import type { Piece, PieceSymbol } from "chess.js";
import { pieceGlyphs } from "../lib/position";
import type { PieceTheme } from "../lib/themes";

/**
 * Vector piece silhouettes in a 45x45 box (the de-facto chess SVG coordinate
 * space). Colours come from CSS custom properties (`--piece-fill` /
 * `--piece-stroke`) so board and piece themes can restyle them without new
 * geometry. The "native" set falls back to Unicode glyphs.
 */

const BASE = `<rect class="pc-base" x="10.5" y="37" width="24" height="3.6" rx="1.8" />`;
const COLLAR = `<rect class="pc-collar" x="13.5" y="32.5" width="18" height="3.2" rx="1.6" />`;

const SHAPES: Record<PieceSymbol, string> = {
  p: `
    <circle class="pc" cx="22.5" cy="14" r="5.1" />
    <path class="pc" d="M16 32.8 Q17 23 22.5 20 Q28 23 29 32.8 Z" />
    ${COLLAR}${BASE}`,
  r: `
    <path class="pc" d="M13.5 11 h3.4 v3 h3.4 v-3 h4.4 v3 h3.4 v-3 h3.4 v6.4 h-21.4 z" />
    <path class="pc" d="M15.6 18.4 L17.4 32.4 h10.2 l1.8-14 z" />
    ${COLLAR}${BASE}`,
  b: `
    <circle class="pc" cx="22.5" cy="8.4" r="2" />
    <path class="pc" d="M22.5 10.5 C27 14 29 18 29 21 C29 24.4 26 26.4 22.5 26.4 C19 26.4 16 24.4 16 21 C16 18 18 14 22.5 10.5 Z" />
    <path class="pc-cut" d="M22.5 13 L22.5 23" />
    <path class="pc" d="M16 32.8 Q18 26 22.5 24 Q27 26 29 32.8 Z" />
    ${COLLAR}${BASE}`,
  n: `
    <path class="pc" d="M22 10 C32 11 33 20 33 32.6 L16 32.6 C16 26 19 23 24.5 19.5 C21.5 19.5 19 20.5 17 23.4 C15 20 16.5 15.5 19.5 13.4 L17.6 11.4 C18.8 9.4 20 9 22 10 Z" />
    <circle class="pc-eye" cx="20" cy="16.5" r="1.1" />
    ${COLLAR}${BASE}`,
  q: `
    <circle class="pc" cx="12.5" cy="11" r="2.1" />
    <circle class="pc" cx="22.5" cy="9" r="2.1" />
    <circle class="pc" cx="32.5" cy="11" r="2.1" />
    <path class="pc" d="M12.5 12 L15.5 31.6 h14 L32.5 12 L28 22 L25 11 L22.5 22 L20 11 L17 22 Z" />
    ${COLLAR}${BASE}`,
  k: `
    <path class="pc-cross" d="M21 5 h3 v3 h3 v3 h-3 v3 h-3 v-3 h-3 v-3 h3 z" />
    <path class="pc" d="M14 19 Q22.5 12.5 31 19 L29 32.4 h-13 z" />
    ${COLLAR}${BASE}`
};

type PieceIconProps = {
  piece: Piece;
  theme: PieceTheme;
};

export function PieceIcon({ piece, theme }: PieceIconProps) {
  const label = piece.type.toUpperCase();

  if (theme === "native") {
    return (
      <span
        className={`piece piece-native piece-${piece.color}`}
        data-label={label}
        aria-hidden="true"
      >
        {pieceGlyphs[piece.color][piece.type]}
      </span>
    );
  }

  return (
    <span className={`piece piece-${piece.color}`} data-label={label} aria-hidden="true">
      <svg
        className={`piece-svg piece-svg-${theme}`}
        viewBox="0 0 45 45"
        role="img"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: SHAPES[piece.type] }}
      />
    </span>
  );
}
