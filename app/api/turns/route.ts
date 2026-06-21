import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { nations, auditLog } from "@/db/schema";
import {
  requireUser,
  requireGameMasterOrAdmin,
  requireNationAccess,
  ForbiddenError,
  UnauthenticatedError,
} from "@/lib/authz";
import { eq } from "drizzle-orm";
import { z } from "zod";

const markPlayedSchema = z.object({
  nationId: z.string().uuid(),
});

/**
 * POST /api/turns
 * A nation's owner marks their current week as played. This flips
 * turnStatus -> 'played' but does NOT advance currentWeek — only a GM
 * advancing the round does that (see PATCH below). This split matters:
 * "I'm done with my turn" and "the round has moved on" are different
 * actions with different authority requirements, and collapsing them
 * would let a player unilaterally advance the week.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const user = requireUser(session?.user ?? null);
    const body = markPlayedSchema.parse(await req.json());

    const nation = await db.query.nations.findFirst({
      where: eq(nations.id, body.nationId),
    });
    if (!nation) {
      return NextResponse.json({ error: "Nation not found" }, { status: 404 });
    }

    requireNationAccess(user, nation.ownerId);

    if (nation.turnStatus === "played") {
      return NextResponse.json({ error: "Turn already marked played" }, { status: 409 });
    }

    const [updated] = await db
      .update(nations)
      .set({ turnStatus: "played", updatedAt: new Date() })
      .where(eq(nations.id, body.nationId))
      .returning({ id: nations.id, currentWeek: nations.currentWeek, turnStatus: nations.turnStatus });

    await db.insert(auditLog).values({
      actorUserId: user.id,
      action: "turn.mark_played",
      targetType: "nation",
      targetId: body.nationId,
      metadata: JSON.stringify({ week: nation.currentWeek }),
    });

    return NextResponse.json({ nation: updated });
  } catch (err) {
    return handleAuthError(err);
  }
}

const advanceSchema = z.object({
  nationId: z.string().uuid(),
});

/**
 * PATCH /api/turns
 * GM/admin advances a single nation to its next week and resets that
 * nation's status back to 'waiting'. Per-nation, not global — matches
 * the requirement that nations track independent week counters.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    const actor = requireGameMasterOrAdmin(session?.user ?? null);
    const body = advanceSchema.parse(await req.json());

    const nation = await db.query.nations.findFirst({
      where: eq(nations.id, body.nationId),
    });
    if (!nation) {
      return NextResponse.json({ error: "Nation not found" }, { status: 404 });
    }

    const [updated] = await db
      .update(nations)
      .set({
        currentWeek: nation.currentWeek + 1,
        turnStatus: "waiting",
        updatedAt: new Date(),
      })
      .where(eq(nations.id, body.nationId))
      .returning({ id: nations.id, currentWeek: nations.currentWeek, turnStatus: nations.turnStatus });

    await db.insert(auditLog).values({
      actorUserId: actor.id,
      action: "turn.advance",
      targetType: "nation",
      targetId: body.nationId,
      metadata: JSON.stringify({ newWeek: updated.currentWeek }),
    });

    return NextResponse.json({ nation: updated });
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
  if (err instanceof z.ZodError) {
    return NextResponse.json({ error: "Invalid request", details: err.issues }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
