import { useState } from "react";

/**
 * useState that goes back to `value` whenever `resetKey` changes, e.g. a text
 * box that follows the current FEN but can be edited in between. The reset
 * happens during render, so there is never a frame showing the stale value.
 */
export function useResettableState<T>(value: T, resetKey: unknown) {
  const [state, setState] = useState(value);
  const [key, setKey] = useState(resetKey);
  if (!Object.is(key, resetKey)) {
    setKey(resetKey);
    setState(value);
  }
  return [state, setState] as const;
}
