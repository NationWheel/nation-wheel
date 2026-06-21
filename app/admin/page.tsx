import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { nations, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AdminUserTable } from "./_components/AdminUserTable";
import { AdminNationTable } from "./_components/AdminNationTable";

export default async function AdminPage() {
  const session = await auth();
  const user = session!.user; // middleware + layout-level role gate already enforced

  const [allUsers, allNations] = await Promise.all([
    db
      .select({
        id: users.id,
        discordUsername: users.discordUsername,
        discordAvatar: users.discordAvatar,
        role: users.role,
        isActive: users.isActive,
      })
      .from(users)
      .orderBy(users.discordUsername),
    db
      .select({
        id: nations.id,
        name: nations.name,
        ownerId: nations.ownerId,
        currentWeek: nations.currentWeek,
        turnStatus: nations.turnStatus,
        intelRank: nations.intelRank,
        ownerDiscordUsername: users.discordUsername,
      })
      .from(nations)
      .leftJoin(users, eq(nations.ownerId, users.id))
      .orderBy(nations.name),
  ]);

  return (
    <main className="min-h-screen bg-neutral-950 p-8 text-neutral-100">
      <h1 className="mb-1 text-2xl font-bold">GM / Admin Panel</h1>
      <p className="mb-8 text-sm text-neutral-400">
        Signed in as {user.discordUsername} · {user.role}
      </p>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Nations</h2>
        <AdminNationTable
          nations={allNations}
          users={allUsers}
          canManageRoles={user.role === "admin"}
        />
      </section>

      {user.role === "admin" && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Users &amp; Roles</h2>
          <AdminUserTable users={allUsers} currentUserId={user.id} />
        </section>
      )}
    </main>
  );
}
