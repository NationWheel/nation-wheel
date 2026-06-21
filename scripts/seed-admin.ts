/**
 * One-time bootstrap: promote a user to "admin" by their Discord ID.
 *
 * Why this needs to exist: every user who signs in via Discord OAuth is
 * created with role="player" by default (see db/schema.ts). There is no
 * UI path to become the first admin, by design — if there were, anyone
 * could self-promote. So the very first admin has to be granted via
 * direct database access, outside the app's own permission system.
 *
 * Usage:
 *   1. Sign in once via Discord normally (this creates your `users` row).
 *   2. Find your Discord ID (right-click your name in Discord with
 *      Developer Mode on, "Copy User ID" — or check the users table).
 *   3. Run: npm run seed:admin -- <your-discord-id>
 *
 * After this, that user is admin and can promote/demote everyone else
 * through the normal /api/admin/users endpoint — this script never needs
 * to run again except for disaster recovery.
 */
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const discordId = process.argv[2];
  if (!discordId) {
    console.error("Usage: npm run seed:admin -- <discord-id>");
    process.exit(1);
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.discordId, discordId),
  });

  if (!existing) {
    console.error(
      `No user found with discordId=${discordId}. Sign in via Discord at least once first.`
    );
    process.exit(1);
  }

  await db.update(users).set({ role: "admin" }).where(eq(users.discordId, discordId));

  console.log(`✅ ${existing.discordUsername} (${discordId}) is now an admin.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
