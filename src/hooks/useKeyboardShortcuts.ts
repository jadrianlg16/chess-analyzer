import { useEffect } from "react";

type Shortcuts = {
  onStart: () => void;
  onPrev: () => void;
  onNext: () => void;
  onEnd: () => void;
  onFlip: () => void;
};

/** ← / → step through the game, Home / End jump, F flips the board. Ignored while typing in a field. */
export function useKeyboardShortcuts(enabled: boolean, { onStart, onPrev, onNext, onEnd, onFlip }: Shortcuts) {
  useEffect(() => {
    if (!enabled) return;

    function onKey(event: KeyboardEvent) {
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
        onPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onNext();
      } else if (event.key === "Home") {
        event.preventDefault();
        onStart();
      } else if (event.key === "End") {
        event.preventDefault();
        onEnd();
      } else if (event.key === "f" || event.key === "F") {
        onFlip();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, onEnd, onFlip, onNext, onPrev, onStart]);
}
