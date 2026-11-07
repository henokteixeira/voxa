import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";
import { DomainError, type ErrorCode } from "../domain/errors.js";
import { requestIdOf } from "./request-context.js";

/** Every error the API answers has this body. `code` is what clients branch on. */
export interface ApiErrorBody {
  statusCode: number;
  code: ErrorCode | "internal";
  message: string;
  requestId: string;
}

const STATUS: Record<ErrorCode, number> = {
  invalid: HttpStatus.BAD_REQUEST,
  not_found: HttpStatus.NOT_FOUND,
  ended: HttpStatus.CONFLICT,
  bad_audio: HttpStatus.UNPROCESSABLE_ENTITY,
  tutor_unavailable: HttpStatus.BAD_GATEWAY,
  voice_unavailable: HttpStatus.SERVICE_UNAVAILABLE,
};

/** HTTP errors raised by Nest itself (unknown route, malformed JSON), mapped to the closest code. */
function codeForStatus(status: number): ApiErrorBody["code"] {
  if (status === HttpStatus.NOT_FOUND) return "not_found";
  if (status >= 400 && status < 500) return "invalid";
  return "internal";
}

function httpMessage(error: HttpException): string {
  const response = error.getResponse();
  if (typeof response === "string") return response;
  const message = (response as { message?: unknown }).message;
  if (Array.isArray(message)) return message.join("; ");
  return typeof message === "string" ? message : error.message;
}

/**
 * The single place that turns errors into HTTP answers and logs them.
 * Expected failures keep their public message; anything else is a bug, logged with its stack and
 * answered as a generic 500 so no internals leak.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("HTTP");

  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const requestId = requestIdOf(req);
    const where = `${req.method} ${req.originalUrl} [${requestId}]`;

    let body: ApiErrorBody;
    if (error instanceof DomainError) {
      body = { statusCode: STATUS[error.code], code: error.code, message: error.publicMessage, requestId };
      if (body.statusCode >= 500) this.logger.warn(`${where} ${error.name}: ${error.message}${causeOf(error)}`);
    } else if (error instanceof HttpException) {
      const statusCode = error.getStatus();
      body = { statusCode, code: codeForStatus(statusCode), message: httpMessage(error), requestId };
      if (statusCode >= 500) this.logger.error(`${where} ${error.message}`, error.stack);
    } else {
      body = { statusCode: 500, code: "internal", message: "Something went wrong.", requestId };
      this.logger.error(`${where} unexpected error: ${(error as Error)?.message ?? String(error)}`, (error as Error)?.stack);
    }
    if (!res.headersSent) res.status(body.statusCode).json(body);
  }
}

function causeOf(error: Error): string {
  return error.cause instanceof Error ? ` (cause: ${error.cause.message})` : "";
}
