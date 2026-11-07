import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

export const REQUEST_ID_HEADER = "x-request-id";
/** A caller's own id is kept only when it looks like one (no log injection). */
const VALID_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** Polled every few seconds by the web app: logging every success would drown the rest. */
const QUIET_PATHS = new Set(["/api/health", "/health"]);

const logger = new Logger("HTTP");

/** Why the request failed, for its access log line (set by the exception filter). */
export function setErrorDetail(res: Response, detail: string): void {
  res.locals.errorDetail = detail;
}

/** The id of this request, as set by `requestContext`. */
export function requestIdOf(req: Request): string {
  const id = req.headers[REQUEST_ID_HEADER];
  return typeof id === "string" ? id : "-";
}

/**
 * Gives every request an id (the caller's `x-request-id` or a new one), echoes it in the response so a
 * bug report can name it, and logs one line per request with its status, duration and, on failure, why.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id = typeof incoming === "string" && VALID_ID.test(incoming) ? incoming : randomUUID();
  req.headers[REQUEST_ID_HEADER] = id;
  res.setHeader(REQUEST_ID_HEADER, id);

  const started = performance.now();
  // "close" also fires when the client goes away before the answer is sent.
  res.on("close", () => {
    const aborted = !res.writableFinished;
    if (!aborted && res.statusCode < 400 && QUIET_PATHS.has(req.path)) return;
    const status = aborted ? "aborted" : String(res.statusCode);
    const detail = typeof res.locals.errorDetail === "string" ? ` ${res.locals.errorDetail}` : "";
    const line = `${req.method} ${req.originalUrl} ${status} ${Math.round(performance.now() - started)}ms [${id}]${detail}`;
    if (res.statusCode >= 500) logger.error(line);
    else if (aborted) logger.warn(line);
    else if (res.statusCode >= 400) logger.warn(line);
    else logger.log(line);
  });
  next();
}
