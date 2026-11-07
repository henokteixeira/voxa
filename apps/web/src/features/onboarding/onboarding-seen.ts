const KEY = "voxa.onboardingSeen";

/**
 * The learner went through the onboarding (to the level chat, or chose "Do it later"): Today stops opening it
 * on its own, so coming back without a level never loops. Today's Start still opens it.
 */
export function markOnboardingSeen() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Without storage the onboarding simply opens again next time.
  }
}

export function onboardingSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
