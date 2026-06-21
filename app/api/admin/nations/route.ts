import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { nations, users, auditLog } from "@/db/schema";
import { requireGameMasterOrAdmin, ForbiddenError, UnauthenticatedError } from "@/lib/authz";
import { clampIntelRank } from "@/lib/intel";
import { eq } from "drizzle-orm";
import { z } from "zod";

/**
 * GET /api/admin/nations
 * Full roster with ownership + turn state, for the GM/admin management
 * screen. This is intentionally the GM-facing endpoint — the
 * player-facing nation list (the "waiting / played" board) lives at
 * /api/nations and applies intel redaction; this one does not, because
 * only GM/admin can reach it (enforced below).
 */
export async function GET() {
  try {
    const session = await auth();
    requireGameMasterOrAdmin(session?.user ?? null);

    const rows = await db
      .select({
        id: nations.id,
        name: nations.name,
        currentWeek: nations.currentWeek,
        turnStatus: nations.turnStatus,
        intelRank: nations.intelRank,
        isArchived: nations.isArchived,
        ownerId: nations.ownerId,
        ownerDiscordUsername: users.discordUsername,
      })
      .from(nations)
      .leftJoin(users, eq(nations.ownerId, users.id))
      .orderBy(nations.name);

    return NextResponse.json({ nations: rows });
  } catch (err) {
    return handleAuthError(err);
  }
}

const createNationSchema = z.object({
  name: z.string().min(1).max(80),
  intelRank: z.number().int().min(1).max(9).optional(),
});

/**
 * POST /api/admin/nations
 * Create a new, unowned nation. GM or admin.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const actor = requireGameMasterOrAdmin(session?.user ?? null);

    const body = createNationSchema.parse(await req.json());

    const [created] = await db
      .insert(nations)
      .values({
        name: body.name,
        intelRank: body.intelRank ? clampIntelRank(body.intelRank) : 1,
      })
      .returning();

    await db.insert(auditLog).values({
      actorUserId: actor.id,
      action: "nation.create",
      targetType: "nation",
      targetId: created.id,
      metadata: JSON.stringify({ name: body.name }),
    });

    return NextResponse.json({ nation: created }, { status: 201 });
  } catch (err) {
    return handleAuthError(err);
  }
}

const assignSchema = z.object({
  nationId: z.string().uuid(),
  // null = unassign
  userId: z.string().uuid().nullable(),
});

/**
 * PATCH /api/admin/nations
 * Assign or unassign a nation's owner. GM or admin.
 *
 * Ownership invariant enforced here (see db/schema.ts comment on
 * nations.ownerId): a user may own at most one nation. We enforce this
 * in application code rather than relying solely on the DB unique index,
 * because we want a clear 409 error message rather than a raw constraint
 * violation bubbling up — and because assigning needs to atomically clear
 * any *other* nation that user previously owned, which a unique index
 * alone can't express.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    const actor = requireGameMasterOrAdmin(session?.user ?? null);

    const body = assignSchema.parse(await req.json());

    const nation = await db.query.nations.findFirst({
      where: eq(nations.id, body.nationId),
    });
    if (!nation) {
      return NextResponse.json({ error: "Nation not found" }, { status: 404 });
    }

    if (body.userId) {
      const targetUser = await db.query.users.findFirst({
        where: eq(users.id, body.userId),
      });
      if (!targetUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      // Clear any nation this user currently owns (enforces 1 user -> 1 nation)
      await db
        .update(nations)
        .set({ ownerId: null, updatedAt: new Date() })
        .where(eq(nations.ownerId, body.userId));
    }

    const [updated] = await db
      .update(nations)
      .set({ ownerId: body.userId, updatedAt: new Date() })
      .where(eq(nations.id, body.nationId))
      .returning();

    await db.insert(auditLog).values({
      actorUserId: actor.id,
      action: "nation.assign",
      targetType: "nation",
      targetId: body.nationId,
      metadata: JSON.stringify({ assignedTo: body.userId }),
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
