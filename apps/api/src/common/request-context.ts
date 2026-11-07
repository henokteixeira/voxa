import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

export const REQUEST_ID_HEADER = "x-request-id";
/** A caller's own id is kept only when it looks like one (no log injection). */
const VALID_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** Polled every few seconds by the web app: logging every success would drown the rest. */
const QUIET_PATHS = new Set(["/api/health", "/health"]);

const logger = new Logger("HTTP");

/** The id of this request, as set by `requestContext`. */
export function requestIdOf(req: Request): string {
  const id = req.headers[REQUEST_ID_HEADER];
  return typeof id === "string" ? id : "-";
}

/**
 * Gives every request an id (the caller's `x-request-id` or a new one), echoes it in the response so a
 * bug report can name it, and logs one line per request with its status and duration.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id = typeof incoming === "string" && VALID_ID.test(incoming) ? incoming : randomUUID();
  req.headers[REQUEST_ID_HEADER] = id;
  res.setHeader(REQUEST_ID_HEADER, id);

  const started = performance.now();
  res.on("finish", () => {
    if (res.statusCode < 400 && QUIET_PATHS.has(req.path)) return;
    const line = `${req.method} ${req.originalUrl} ${res.statusCode} ${Math.round(performance.now() - started)}ms [${id}]`;
    if (res.statusCode >= 500) logger.error(line);
    else if (res.statusCode >= 400) logger.warn(line);
    else logger.log(line);
  });
  next();
}
