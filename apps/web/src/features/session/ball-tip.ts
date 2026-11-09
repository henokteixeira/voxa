const KEY = "voxa.ballTipSeen";

/**
 * The one-time tip that tapping the ball sends the answer or stops the tutor. It shows in the first session
 * until the learner taps the ball or the session ends, then never again.
 */
export function ballTipSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    // Without storage the tip would show every time; the small caption under the ball already says it.
    return true;
  }
}

export function markBallTipSeen() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Nothing to keep without storage.
  }
}
