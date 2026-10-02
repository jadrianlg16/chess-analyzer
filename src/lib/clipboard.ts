/**
 * Copy text with the async Clipboard API. Resolves to false instead of
 * throwing when the API is missing (pages served over plain HTTP from another
 * host) or the browser refuses the write.
 */
export async function copyToClipboard(
  text: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined = globalThis.navigator?.clipboard
): Promise<boolean> {
  if (!clipboard) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
