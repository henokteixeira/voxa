import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { configureHttpApp } from "./common/http-app.js";
import type { Env } from "./config/env.js";

async function bootstrap() {
  const app = configureHttpApp(await NestFactory.create(AppModule));
  await app.listen(app.get<ConfigService<Env, true>>(ConfigService).get("API_PORT", { infer: true }));
}
void bootstrap();
