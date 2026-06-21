import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { nations, nationActions } from "@/db/schema";
import { requireUser, hasFullVisibility, UnauthenticatedError, ForbiddenError } from "@/lib/authz";
import { filterActionsForViewer } from "@/lib/intel";
import { eq } from "drizzle-orm";

/**
 * GET /api/nations/:nationId/actions
 *
 * Returns the action feed for a single nation, redacted according to the
 * REQUESTING user's nation's intel rank — never according to anything the
 * client sends. This is the one rule that must never regress: the viewer's
 * rank is always re-derived server-side from `session.user.nation`.
 *
 * Flow:
 *   1. Load the target nation's actions.
 *   2. Determine the viewer's effective rank:
 *      - GM/admin or the nation's own owner -> full visibility (rank
 *        check bypassed entirely via hasFullVisibility).
 *      - Otherwise -> the rank of the VIEWER'S OWN nation (a player with
 *        no nation assigned has no rank and sees nothing beyond public
 *        metadata — there is no "default" rank that leaks information).
 *   3. Filter through filterActionsForViewer(), which redacts rather than
 *      drops, so the UI can show "an action exists but is classified"
 *      instead of silently fewer rows (those are different UX signals and
 *      collapsing them would be a quiet info leak: "this nation took N
 *      actions this week" is itself sometimes meaningful).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ nationId: string }> }
) {
  try {
    const session = await auth();
    const user = requireUser(session?.user ?? null);
    const { nationId } = await params;

    const targetNation = await db.query.nations.findFirst({
      where: eq(nations.id, nationId),
    });
    if (!targetNation) {
      return NextResponse.json({ error: "Nation not found" }, { status: 404 });
    }

    const actions = await db
      .select()
      .from(nationActions)
      .where(eq(nationActions.nationId, nationId))
      .orderBy(nationActions.week, nationActions.createdAt);

    const viewerHasFullVisibility = hasFullVisibility(user, targetNation.ownerId);

    // A viewer's rank for cross-nation visibility is THEIR OWN nation's
    // intel rank — not the target's. session.user.nation is populated by
    // the session callback in lib/auth.ts on every request, so this is
    // always fresh, never a stale client-supplied value.
    const viewerRank = session!.user.nation?.intelRank ?? 0;

    const visible = filterActionsForViewer(
      actions.map((a) => ({
        id: a.id,
        nationId: a.nationId,
        week: a.week,
        category: a.category,
        description: a.description,
        confidentialityLevel: a.confidentialityLevel,
      })),
      viewerRank,
      viewerHasFullVisibility
    );

    return NextResponse.json({ nationId, actions: visible });
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
