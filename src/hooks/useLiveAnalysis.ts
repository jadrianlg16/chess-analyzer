import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StockfishClient, type AnalysisUpdate } from "../lib/analysis";

/** Wait this long after the position or settings change, so stepping through a game doesn't start a search per move. */
const ANALYZE_DELAY_MS = 350;

type LiveAnalysisOptions = {
  fen: string;
  validation: { ok: boolean; error?: string };
  /** True while a game review is running; live analysis waits for it. */
  paused: boolean;
  depth: number;
  multipv: number;
};

/**
 * Keeps one engine analyzing the position on the board. `analysis` is the
 * latest update; `live` is what the panel shows, where an update that belongs
 * to another position counts as still loading.
 */
export function useLiveAnalysis({ fen, validation, paused, depth, multipv }: LiveAnalysisOptions) {
  const engineRef = useRef<StockfishClient | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisUpdate>({ status: "idle", lines: [] });

  useEffect(() => {
    engineRef.current = new StockfishClient(setAnalysis);
    return () => engineRef.current?.dispose();
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    if (paused) {
      engine.stop({ emit: false });
      return;
    }

    // The engine is the external system this effect keeps in sync; the panel
    // status changes with it, before the engine itself reports back.
    if (!validation.ok) {
      engine.stop({ emit: false });
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
      setAnalysis({ status: "error", lines: [], message: validation.error || "Invalid position" });
      return;
    }

    setAnalysis({ status: "loading", lines: [] });
    const timer = window.setTimeout(() => {
      engine.analyze(fen, { depth, multipv });
    }, ANALYZE_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      engine.stop({ emit: false });
    };
  }, [paused, depth, fen, multipv, validation.error, validation.ok]);

  const live = useMemo<AnalysisUpdate>(
    () => (analysis.fen && analysis.fen !== fen ? { status: "loading", lines: [] } : analysis),
    [analysis, fen]
  );

  /** Search the current position now, without the delay. */
  const analyze = useCallback(() => engineRef.current?.analyze(fen, { depth, multipv }), [depth, fen, multipv]);
  /** Stop searching and keep the lines found so far. */
  const stop = useCallback(() => engineRef.current?.stop(), []);
  const clear = useCallback(() => setAnalysis({ status: "idle", lines: [] }), []);
  const showError = useCallback((message: string) => setAnalysis({ status: "error", lines: [], message }), []);

  return { analysis, live, analyze, stop, clear, showError };
}
