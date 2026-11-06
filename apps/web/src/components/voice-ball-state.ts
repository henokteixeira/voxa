export type BallState = "idle" | "listening" | "thinking" | "speaking" | "hint" | "success";

export const BALL_COLOR: Record<BallState, string> = {
  idle: "var(--color-apricot)",
  listening: "var(--color-mist)",
  thinking: "var(--color-lilac)",
  speaking: "var(--color-apricot)",
  hint: "var(--color-honey)",
  success: "var(--color-sage)",
};

/** The state's spoken label and its text color (always the -ink pair). */
export const STATE_LABEL: Record<BallState, { text: string; className: string }> = {
  idle: { text: "Your turn · tap to speak", className: "text-taupe" },
  listening: { text: "Listening · tap to send", className: "text-mist-ink" },
  thinking: { text: "Thinking", className: "text-lilac-ink" },
  speaking: { text: "Speaking", className: "text-apricot-ink" },
  hint: { text: "Hint · tap and try again", className: "text-honey-ink" },
  success: { text: "Nice", className: "text-sage-ink" },
};

