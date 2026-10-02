import { useCallback, useMemo, useState } from "react";
import type { ActiveVariationView } from "../components/AnalysisPanel";
import type { AnalysisLine } from "../lib/analysis";
import { previewVariation, type ActiveVariation } from "../lib/variation";

/** Stepping through an engine line on the board without changing the game. */
export function useVariationPreview() {
  const [variation, setVariation] = useState<ActiveVariation | null>(null);
  const preview = useMemo(() => (variation ? previewVariation(variation) : null), [variation]);
  const view = useMemo<ActiveVariationView | null>(
    () => (variation ? { multipv: variation.multipv, ply: variation.ply, total: variation.uciMoves.length } : null),
    [variation]
  );

  /** Preview `line` from `sourceFen` up to move `ply` (1-based). */
  const select = useCallback((sourceFen: string, line: AnalysisLine, ply: number) => {
    setVariation({
      sourceFen,
      multipv: line.multipv,
      uciMoves: line.uciMoves,
      ply: Math.max(1, Math.min(ply, line.uciMoves.length))
    });
  }, []);

  const step = useCallback((direction: -1 | 1) => {
    setVariation((current) =>
      current ? { ...current, ply: Math.max(0, Math.min(current.uciMoves.length, current.ply + direction)) } : current
    );
  }, []);

  const exit = useCallback(() => setVariation(null), []);

  return { variation, preview, view, select, step, exit };
}
