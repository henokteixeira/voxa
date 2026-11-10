/**
 * Shorter than this, a sentence is spoken with the next one, so the voice does not stop after every "OK."
 * (a design choice, to tune by ear).
 */
export const MIN_PART_LENGTH = 25;

/**
 * Splits a line into the parts its voice is made in, one sentence or a few short ones each, so the first
 * sentence plays while the next ones are being made. Splits after . ! ? or … followed by a space; joined
 * back with spaces, the parts are the line.
 */
export function speechParts(text: string): string[] {
  const sentences = text
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .filter((sentence) => sentence.length > 0);
  const parts: string[] = [];
  let pending = "";
  for (const sentence of sentences) {
    pending = pending ? `${pending} ${sentence}` : sentence;
    if (pending.length >= MIN_PART_LENGTH) {
      parts.push(pending);
      pending = "";
    }
  }
  // A short last sentence goes with the one before it.
  if (pending) {
    if (parts.length > 0) parts[parts.length - 1] = `${parts[parts.length - 1]} ${pending}`;
    else parts.push(pending);
  }
  return parts;
}
