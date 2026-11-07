/** How long the learner's own words stay on the main screen: long enough to read them back, no longer. */
export function captionHoldMs(text: string): number {
  return Math.min(8000, Math.max(3000, 2000 + 60 * text.length));
}

