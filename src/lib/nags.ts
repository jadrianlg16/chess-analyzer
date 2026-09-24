import type { Judgement } from "./review";

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

/** Only errors get a glyph; best and good moves are left unannotated. */
export function nagForJudgement(judgement: Judgement): number | undefined {
  if (judgement === "blunder") return NAG_BY_QUALITY.blunder;
  if (judgement === "mistake") return NAG_BY_QUALITY.mistake;
  if (judgement === "inaccuracy") return NAG_BY_QUALITY.inaccuracy;
  return undefined;
}
