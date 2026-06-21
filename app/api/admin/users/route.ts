import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { users, auditLog } from "@/db/schema";
import { requireGameMasterOrAdmin, requireAdmin, ForbiddenError, UnauthenticatedError } from "@/lib/authz";
import { eq } from "drizzle-orm";
import { z } from "zod";

/**
 * GET /api/admin/users
 * Visible to GM + admin (GMs need the roster to assign nations even if
 * they can't grant GM/admin roles themselves).
 */
export async function GET() {
  try {
    const session = await auth();
    requireGameMasterOrAdmin(session?.user ?? null);

    const rows = await db
      .select({
        id: users.id,
        discordId: users.discordId,
        discordUsername: users.discordUsername,
        discordAvatar: users.discordAvatar,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(users.discordUsername);

    return NextResponse.json({ users: rows });
  } catch (err) {
    return handleAuthError(err);
  }
}

const roleChangeSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["player", "gamemaster", "admin"]),
});

/**
 * PATCH /api/admin/users
 * Change a user's platform role. Admin-only — a GM cannot promote
 * themselves or anyone else to GM/admin. This is the one place privilege
 * escalation could happen, so it gets the strictest check in the app.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    const actor = requireAdmin(session?.user ?? null);

    const body = roleChangeSchema.parse(await req.json());

    // Prevent an admin from locking everyone out by demoting themselves
    // if they are the last admin. Cheap safety check, not a full quorum
    // system — sufficient for a small-scale GM tool.
    if (body.userId === actor.id && body.role !== "admin") {
      const adminCount = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"));
      if (adminCount.length <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the last administrator" },
          { status: 409 }
        );
      }
    }

    const [updated] = await db
      .update(users)
      .set({ role: body.role, updatedAt: new Date() })
      .where(eq(users.id, body.userId))
      .returning({ id: users.id, role: users.role });

    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await db.insert(auditLog).values({
      actorUserId: actor.id,
      action: "user.role.change",
      targetType: "user",
      targetId: body.userId,
      metadata: JSON.stringify({ newRole: body.role }),
    });

    return NextResponse.json({ user: updated });
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
