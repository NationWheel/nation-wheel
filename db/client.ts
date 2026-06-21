import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "@/db/schema";

/**
 * Using Neon's HTTP driver directly (not @vercel/postgres, which Vercel's
 * own build output flags as deprecated now that "Vercel Postgres" is just
 * Neon under the hood). This reads DATABASE_URL, which is the variable
 * name Neon's Vercel Marketplace integration actually provisions —
 * @vercel/postgres expects POSTGRES_URL specifically, which this project's
 * Neon integration does not create, causing a silent connection failure.
 *
 * neon-http (not neon-serverless/websockets) is intentional: it's
 * stateless per-request, which is exactly the right shape for serverless
 * functions that don't hold a persistent connection between invocations.
 */
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
