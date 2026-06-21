import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { nations, auditLog } from "@/db/schema";
import { requireGameMasterOrAdmin, ForbiddenError, UnauthenticatedError } from "@/lib/authz";
import { clampIntelRank, MIN_INTEL_RANK, MAX_INTEL_RANK } from "@/lib/intel";
import { eq } from "drizzle-orm";
import { z } from "zod";

const setRankSchema = z.object({
  nationId: z.string().uuid(),
  intelRank: z.number().int().min(MIN_INTEL_RANK).max(MAX_INTEL_RANK),
});

/**
 * PATCH /api/intel
 * Sets a nation's intelligence/secret-service rank. GM or admin only —
 * a nation cannot raise its own rank; that would let a player unlock
 * visibility into rivals at will, which defeats the entire point of the
 * mechanic. This is intentionally a separate, narrow endpoint rather than
 * a field on a generic "edit nation" route, so the audit trail for
 * "who changed whose intel rank, and when" is unambiguous and easy to
 * query later.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    const actor = requireGameMasterOrAdmin(session?.user ?? null);

    const body = setRankSchema.parse(await req.json());
    const clamped = clampIntelRank(body.intelRank);

    const [updated] = await db
      .update(nations)
      .set({ intelRank: clamped, updatedAt: new Date() })
      .where(eq(nations.id, body.nationId))
      .returning({ id: nations.id, name: nations.name, intelRank: nations.intelRank });

    if (!updated) {
      return NextResponse.json({ error: "Nation not found" }, { status: 404 });
    }

    await db.insert(auditLog).values({
      actorUserId: actor.id,
      action: "intel.rank.change",
      targetType: "nation",
      targetId: body.nationId,
      metadata: JSON.stringify({ newRank: clamped }),
    });

    return NextResponse.json({ nation: updated });
  } catch (err) {
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
}
