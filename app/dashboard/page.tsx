import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { nations } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Renders the "Pays X week 1 en attente / Pays Z week 2 has played" board
 * directly from the DB on the server — no client-side fetch needed for
 * the initial render, which also means there's no window where an
 * unauthorized client could request this before the auth check resolves.
 */
export default async function DashboardPage() {
  const session = await auth();
  const user = session!.user; // middleware guarantees a session exists here

  const allNations = await db
    .select({
      id: nations.id,
      name: nations.name,
      currentWeek: nations.currentWeek,
      turnStatus: nations.turnStatus,
    })
    .from(nations)
    .where(eq(nations.isArchived, false))
    .orderBy(nations.name);

  const waiting = allNations.filter((n) => n.turnStatus === "waiting");
  const played = allNations.filter((n) => n.turnStatus === "played");

  return (
    <main className="min-h-screen bg-neutral-950 p-8 text-neutral-100">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Nation Wheel</h1>
          <p className="text-sm text-neutral-400">
            Signed in as {user.discordUsername} · {user.role}
            {user.nation ? ` · controlling ${user.nation.name}` : " · no nation assigned"}
          </p>
        </div>
        {(user.role === "gamemaster" || user.role === "admin") && (
          <a
            href="/admin"
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800"
          >
            GM / Admin Panel
          </a>
        )}
      </header>

      <section className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-400">
            En attente — {waiting.length}
          </h2>
          <ul className="space-y-2">
            {waiting.map((n) => (
              <li
                key={n.id}
                className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-4 py-3"
              >
                <span className="font-medium">{n.name}</span>
                <span className="ml-2 text-sm text-neutral-400">
                  week {n.currentWeek} en attente
                </span>
              </li>
            ))}
            {waiting.length === 0 && (
              <li className="text-sm text-neutral-500">All nations have played.</li>
            )}
          </ul>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-400">
            Has played — {played.length}
          </h2>
          <ul className="space-y-2">
            {played.map((n) => (
              <li
                key={n.id}
                className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 px-4 py-3"
              >
                <span className="font-medium">{n.name}</span>
                <span className="ml-2 text-sm text-neutral-400">
                  week {n.currentWeek} has played
                </span>
              </li>
            ))}
            {played.length === 0 && (
              <li className="text-sm text-neutral-500">No nations have played yet.</li>
            )}
          </ul>
        </div>
      </section>
    </main>
  );
}
