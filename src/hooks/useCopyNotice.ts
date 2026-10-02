import { useCallback, useEffect, useState } from "react";
import { copyToClipboard } from "../lib/clipboard";

export type CopyNotice = { ok: boolean; message: string };

/** Copies FEN or PGN text and keeps a short message saying whether it worked. */
export function useCopyNotice() {
  const [notice, setNotice] = useState<CopyNotice | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), notice.ok ? 2000 : 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const copy = useCallback(async (text: string, label: string) => {
    const ok = await copyToClipboard(text);
    setNotice(
      ok
        ? { ok, message: `${label} copied.` }
        : {
            ok,
            message: `Couldn't copy the ${label}: the browser blocked clipboard access. Copy it from the read-only box in the panel instead.`
          }
    );
  }, []);

  return { notice, copy };
}
