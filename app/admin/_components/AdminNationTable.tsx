"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AdminNation = {
  id: string;
  name: string;
  ownerId: string | null;
  currentWeek: number;
  turnStatus: "waiting" | "played";
  intelRank: number;
  ownerDiscordUsername: string | null;
};

type AdminUser = {
  id: string;
  discordUsername: string;
};

export function AdminNationTable({
  nations,
  users,
}: {
  nations: AdminNation[];
  users: AdminUser[];
  canManageRoles: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function assignOwner(nationId: string, userId: string) {
    setPendingId(nationId);
    setError(null);
    try {
      const res = await fetch("/api/admin/nations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nationId, userId: userId || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to assign nation");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign nation");
    } finally {
      setPendingId(null);
    }
  }

  async function setIntelRank(nationId: string, intelRank: number) {
    setPendingId(nationId);
    setError(null);
    try {
      const res = await fetch("/api/intel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nationId, intelRank }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update intel rank");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update intel rank");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-800">
      {error && (
        <div className="bg-red-950/40 px-4 py-2 text-sm text-red-300">{error}</div>
      )}
      <table className="w-full text-sm">
        <thead className="bg-neutral-900 text-left text-neutral-400">
          <tr>
            <th className="px-4 py-2">Nation</th>
            <th className="px-4 py-2">Owner</th>
            <th className="px-4 py-2">Week / Status</th>
            <th className="px-4 py-2">Intel Rank</th>
          </tr>
        </thead>
        <tbody>
          {nations.map((n) => (
            <tr key={n.id} className="border-t border-neutral-800">
              <td className="px-4 py-3 font-medium">{n.name}</td>
              <td className="px-4 py-3">
                <select
                  defaultValue={n.ownerId ?? ""}
                  disabled={pendingId === n.id}
                  onChange={(e) => assignOwner(n.id, e.target.value)}
                  className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 disabled:opacity-50"
                >
                  <option value="">— unassigned —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.discordUsername}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-3">
                <span
                  className={
                    n.turnStatus === "played"
                      ? "rounded bg-emerald-900/50 px-2 py-0.5 text-emerald-300"
                      : "rounded bg-amber-900/50 px-2 py-0.5 text-amber-300"
                  }
                >
                  week {n.currentWeek} · {n.turnStatus}
                </span>
              </td>
              <td className="px-4 py-3">
                <select
                  defaultValue={n.intelRank}
                  disabled={pendingId === n.id}
                  onChange={(e) => setIntelRank(n.id, Number(e.target.value))}
                  className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 disabled:opacity-50"
                >
                  {Array.from({ length: 9 }, (_, i) => i + 1).map((r) => (
                    <option key={r} value={r}>
                      Lv.{r}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
