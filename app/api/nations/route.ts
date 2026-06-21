import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { nations } from "@/db/schema";
import { requireUser, UnauthenticatedError, ForbiddenError } from "@/lib/authz";
import { eq } from "drizzle-orm";

/**
 * GET /api/nations
 *
 * The "Pays X week 1 en attente / Pays Z week 2 has played" board.
 * Every authenticated user (player or GM) can see this — turnStatus and
 * currentWeek are public information by design (you need to know who's
 * holding up the round), they are NOT gated by intel rank. Intel rank
 * only gates the *content* of actions, not the public waiting/played
 * status, per the spec's "basic public information may still remain
 * visible" clause.
 */
export async function GET() {
  try {
    const session = await auth();
    requireUser(session?.user ?? null);

    const rows = await db
      .select({
        id: nations.id,
        name: nations.name,
        currentWeek: nations.currentWeek,
        turnStatus: nations.turnStatus,
        publicSummary: nations.publicSummary,
      })
      .from(nations)
      .where(eq(nations.isArchived, false))
      .orderBy(nations.name);

    return NextResponse.json({ nations: rows });
  } catch (err) {
    return handleAuthError(err);
  }
}

function handleAuthError(err: unknown) {
  if (err instanceof UnauthenticatedError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
