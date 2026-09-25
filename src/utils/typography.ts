/**
 * Keep the last two words of a paragraph on the same line so the final word
 * doesn’t sit alone (a typographic widow / orphan).
 */
export function preventWidow(text: string): string {
  const trimmed = text.replace(/\s+$/u, '');
  if (!trimmed) return text;
  const trailing = text.slice(trimmed.length);
  const words = trimmed.split(/(\s+)/u);
  // words alternates: word, whitespace, word, whitespace, …
  const tokenCount = words.filter((t, i) => i % 2 === 0 && t.length > 0).length;
  if (tokenCount < 2) return text;

  // Find last two word indices (even positions).
  let lastWordAt = -1;
  let prevWordAt = -1;
  for (let i = words.length - 1; i >= 0; i -= 1) {
    if (i % 2 !== 0) continue;
    if (!words[i]) continue;
    if (lastWordAt < 0) {
      lastWordAt = i;
    } else {
      prevWordAt = i;
      break;
    }
  }
  if (lastWordAt < 0 || prevWordAt < 0) return text;

  // Replace the whitespace between them with a non-breaking space.
  const spaceAt = prevWordAt + 1;
  if (spaceAt < lastWordAt) {
    words[spaceAt] = '\u00A0';
  }
  return words.join('') + trailing;
}
