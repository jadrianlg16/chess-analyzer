/**
 * localStorage access that never throws. Browsers throw on the
 * `window.localStorage` getter itself when site data is blocked (for example
 * with "Block all cookies"), and `setItem` throws when storage is full.
 * Settings are a convenience, so the app then simply doesn't remember them.
 */
export function readSetting(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not persisted; the setting still applies for this visit.
  }
}
