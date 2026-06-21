import { drizzle } from "drizzle-orm/vercel-postgres";
import { sql } from "@vercel/postgres";
import * as schema from "@/db/schema";

/**
 * @vercel/postgres manages its own connection pooling tuned for the
 * serverless/edge runtime (it's pgbouncer-aware under the hood when used
 * with a Neon-backed Vercel Postgres instance). We don't hand-roll a pool
 * here — doing so in a serverless function is the classic way to exhaust
 * Postgres connections under load.
 */
export const db = drizzle(sql, { schema });
