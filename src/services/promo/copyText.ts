/** Copies to the clipboard on web; resolves false where the browser (or native) can't. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or insecure context: the link stays visible to copy by hand.
  }
  return false;
}
