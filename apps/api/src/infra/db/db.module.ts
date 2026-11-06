import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema.js";

/** Any Postgres driver (node-postgres in the app, PGlite in tests). */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
export const DATABASE = Symbol("DATABASE");

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Database =>
        drizzle(new Pool({ connectionString: config.getOrThrow<string>("DATABASE_URL") }), { schema }),
    },
  ],
  exports: [DATABASE],
})
export class DbModule {}
