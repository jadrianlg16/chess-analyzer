/** Numeric Annotation Glyphs (a subset of the PGN standard). */
export type MoveQuality = "brilliant" | "good" | "interesting" | "inaccuracy" | "mistake" | "blunder";

export const NAG_BY_QUALITY: Record<MoveQuality, number> = {
  brilliant: 3,
  good: 1,
  interesting: 5,
  inaccuracy: 6,
  mistake: 2,
  blunder: 4
};

const GLYPHS: Record<number, { symbol: string; quality: MoveQuality; label: string }> = {
  1: { symbol: "!", quality: "good", label: "Good move" },
  2: { symbol: "?", quality: "mistake", label: "Mistake" },
  3: { symbol: "!!", quality: "brilliant", label: "Brilliant" },
  4: { symbol: "??", quality: "blunder", label: "Blunder" },
  5: { symbol: "!?", quality: "interesting", label: "Interesting" },
  6: { symbol: "?!", quality: "inaccuracy", label: "Inaccuracy" }
};

export function nagGlyph(nag: number | undefined) {
  if (nag === undefined) return null;
  return GLYPHS[nag] ?? null;
}

/**
 * Classify a move by how much it changed the evaluation (in centipawns, from
 * the mover's perspective). `lostCp` is how much worse the position became for
 * the side that moved compared with the best available move.
 */
export function classifyByLoss(lostCp: number): number | undefined {
  if (lostCp >= 250) return NAG_BY_QUALITY.blunder;
  if (lostCp >= 120) return NAG_BY_QUALITY.mistake;
  if (lostCp >= 50) return NAG_BY_QUALITY.inaccuracy;
  return undefined;
}
