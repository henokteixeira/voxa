/**
 * The one place the web app reports failures it did not expect. Today it writes to the console with
 * enough context to find the server's log line (the request id); an error tracker can be plugged in here.
 */
export interface ErrorContext {
  /** Where it happened, e.g. "api POST /sessions" or "window". */
  where: string;
  requestId?: string;
  status?: number;
}

export function reportError(error: unknown, context: ErrorContext): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[voxa] ${context.where}: ${detail}`, { ...context, error });
}

/** Errors nothing caught: render crashes outside React's own handling and forgotten promises. */
export function reportUncaughtErrors(target: Window = window): void {
  target.addEventListener("error", (event) => reportError(event.error ?? event.message, { where: "window" }));
  target.addEventListener("unhandledrejection", (event) => reportError(event.reason, { where: "unhandled promise" }));
}
