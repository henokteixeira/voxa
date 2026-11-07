import type { INestApplication } from "@nestjs/common";
import { ApiExceptionFilter } from "./api-exception.filter.js";
import { REQUEST_ID_HEADER, requestContext } from "./request-context.js";

/** Request ids, access logs and error answers. Shared by the server and the controller tests. */
export function applyHttpConventions(app: INestApplication): INestApplication {
  app.use(requestContext);
  app.useGlobalFilters(new ApiExceptionFilter());
  return app;
}

/** The running server: conventions plus the /api prefix and CORS (the web app may read the request id). */
export function configureHttpApp(app: INestApplication): INestApplication {
  applyHttpConventions(app);
  app.enableCors({ exposedHeaders: [REQUEST_ID_HEADER] });
  app.setGlobalPrefix("api");
  return app;
}
