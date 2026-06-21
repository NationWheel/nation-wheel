"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AdminUser = {
  id: string;
  discordUsername: string;
  discordAvatar: string | null;
  role: "player" | "gamemaster" | "admin";
  isActive: boolean;
};

export function AdminUserTable({
  users,
  currentUserId,
}: {
  users: AdminUser[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changeRole(userId: string, role: AdminUser["role"]) {
    setPendingId(userId);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update role");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update role");
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
            <th className="px-4 py-2">User</th>
            <th className="px-4 py-2">Role</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-neutral-800">
              <td className="px-4 py-3">
                {u.discordUsername}
                {u.id === currentUserId && (
                  <span className="ml-2 text-xs text-neutral-500">(you)</span>
                )}
              </td>
              <td className="px-4 py-3">
                <span
                  className={
                    u.role === "admin"
                      ? "rounded bg-purple-900/50 px-2 py-0.5 text-purple-300"
                      : u.role === "gamemaster"
                      ? "rounded bg-blue-900/50 px-2 py-0.5 text-blue-300"
                      : "rounded bg-neutral-800 px-2 py-0.5 text-neutral-300"
                  }
                >
                  {u.role}
                </span>
              </td>
              <td className="px-4 py-3">
                <select
                  defaultValue={u.role}
                  disabled={pendingId === u.id}
                  onChange={(e) => changeRole(u.id, e.target.value as AdminUser["role"])}
                  className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm disabled:opacity-50"
                >
                  <option value="player">player</option>
                  <option value="gamemaster">gamemaster</option>
                  <option value="admin">admin</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
