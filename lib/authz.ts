import "server-only";

/**
 * Authorization layer.
 *
 * Design rule: NOTHING in this codebase checks `session.user.role === "..."`
 * directly outside this file. Every route handler calls one of the
 * functions below. This means:
 *   - the permission logic is auditable in one place
 *   - changing what a role can do never requires touching route handlers
 *   - it's structurally impossible to "forget" a check in a new endpoint,
 *     because the helpers throw rather than return a boolean — a route
 *     that forgets to call them simply has no protection, which is loud
 *     and obvious in code review, vs. a silently-wrong boolean check.
 */

export type AccountRole = "player" | "gamemaster" | "admin";

export type AuthedUser = {
  id: string;
  role: AccountRole;
  isActive: boolean;
};

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthenticatedError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/** Throws if there is no authenticated, active user. */
export function requireUser(user: AuthedUser | null | undefined): AuthedUser {
  if (!user) throw new UnauthenticatedError();
  if (!user.isActive) throw new ForbiddenError("Account disabled");
  return user;
}

/** Throws unless the user is gamemaster or admin. */
export function requireGameMasterOrAdmin(user: AuthedUser | null | undefined): AuthedUser {
  const u = requireUser(user);
  if (u.role !== "gamemaster" && u.role !== "admin") {
    throw new ForbiddenError("Game Master privileges required");
  }
  return u;
}

/** Throws unless the user is admin. Role/admin management is admin-only. */
export function requireAdmin(user: AuthedUser | null | undefined): AuthedUser {
  const u = requireUser(user);
  if (u.role !== "admin") {
    throw new ForbiddenError("Administrator privileges required");
  }
  return u;
}

/**
 * Throws unless the user owns `nationOwnerId` OR has elevated privileges.
 * This is the rule behind "a player may only control the nation assigned
 * to them" — GMs/admins are exempt because they need broader access by
 * design, not because of a bug in scoping.
 */
export function requireNationAccess(
  user: AuthedUser | null | undefined,
  nationOwnerId: string | null
): AuthedUser {
  const u = requireUser(user);
  if (u.role === "gamemaster" || u.role === "admin") return u;
  if (nationOwnerId && nationOwnerId === u.id) return u;
  throw new ForbiddenError("You do not control this nation");
}

/**
 * Whether the given user should bypass intel-rank redaction for a given
 * nation's actions — true if they own that nation, or if they are
 * GM/admin (who need full visibility to run the game).
 */
export function hasFullVisibility(
  user: AuthedUser | null | undefined,
  nationOwnerId: string | null
): boolean {
  if (!user || !user.isActive) return false;
  if (user.role === "gamemaster" || user.role === "admin") return true;
  return !!nationOwnerId && nationOwnerId === user.id;
}
