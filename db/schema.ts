import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  uuid,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * ──────────────────────────────────────────────────────────────────────────
 * ENUMS
 * ──────────────────────────────────────────────────────────────────────────
 */

// Global account role. Distinct from "is this user the GM of nation X" —
// this is the platform-wide privilege level.
export const accountRoleEnum = pgEnum("account_role", [
  "player", // default — can only act as the nation assigned to them
  "gamemaster", // elevated — can manage nations, assignments, turns, intel ranks
  "admin", // owner-level — can manage gamemasters and platform config
]);

export const turnStatusEnum = pgEnum("turn_status", [
  "waiting", // nation has not submitted/played its current week
  "played", // nation has played its current week, awaiting GM advance or already advanced
]);

/**
 * ──────────────────────────────────────────────────────────────────────────
 * USERS  (1 row per Discord account)
 * ──────────────────────────────────────────────────────────────────────────
 * Auth.js's adapter tables (accounts, sessions, verificationTokens) reference
 * this table's `id`. We keep our own domain fields directly on `users`
 * rather than a separate `profiles` table, since 1 Discord account = 1
 * platform identity here (no multi-profile requirement was stated).
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),

  // ── Required by @auth/drizzle-adapter's DefaultPostgresUsersTable contract ──
  // The adapter reads/writes these exact columns regardless of provider.
  // We populate `name`/`image` from the Discord profile in lib/auth.ts;
  // `email` stays null since we deliberately don't request Discord's
  // email scope (see lib/auth.ts comment), and `emailVerified` is unused
  // for an OAuth-only, no-email-login setup but must exist on the table.
  name: text("name"),
  email: text("email"),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),

  // ── Our own domain fields ──
  discordId: text("discord_id").notNull(),
  discordUsername: text("discord_username").notNull(),
  discordAvatar: text("discord_avatar"),

  // Platform identity
  role: accountRoleEnum("role").notNull().default("player"),

  // Soft-disable without deleting history/audit trail
  isActive: boolean("is_active").notNull().default(true),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  discordIdIdx: uniqueIndex("users_discord_id_idx").on(t.discordId),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  // A user may own at most one nation (1:1). Enforced by unique index on
  // nations.ownerId below — a nation has exactly one owner, a user owns
  // at most one nation.
  ownedNation: one(nations, {
    fields: [users.id],
    references: [nations.ownerId],
  }),
  auditLogs: many(auditLog),
}));

/**
 * ──────────────────────────────────────────────────────────────────────────
 * NATIONS
 * ──────────────────────────────────────────────────────────────────────────
 * This is intentionally minimal in phase 1. It does NOT contain gameplay
 * state (corps, infra, espionnage, etc.) — that belongs to phase 2 and will
 * live in its own table(s) referencing nations.id once migrated. Phase 1
 * only needs: identity, ownership, turn/week state, and intel rank, since
 * those are the fields the permission and visibility system depends on.
 */
export const nations = pgTable("nations", {
  id: uuid("id").primaryKey().defaultRandom(),

  name: text("name").notNull(),

  // Nullable: a nation can exist unassigned (e.g. created by GM ahead of
  // a player joining). Exactly one user may own a nation; exactly one
  // nation may belong to a user (enforced at the application layer in
  // assignment endpoints — see ARCHITECTURE.md "Ownership invariants").
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),

  // Per-nation week counter. Nations are NOT locked to a shared global
  // week — each nation advances independently once its GM marks it played
  // and advances its turn. This matches the "Pays X week 1 en attente /
  // Pays Z week 2 has played" requirement directly.
  currentWeek: integer("current_week").notNull().default(1),
  turnStatus: turnStatusEnum("turn_status").notNull().default("waiting"),

  // Secret Service / Intelligence rank, 1–9, mirrors the existing
  // gameplay concept. Drives the visibility rule in lib/intel.ts.
  intelRank: integer("intel_rank").notNull().default(1),

  // Public-facing metadata always visible regardless of intel rank
  // (flag, public description) — kept here, not gated.
  publicSummary: text("public_summary"),

  isArchived: boolean("is_archived").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  ownerIdx: uniqueIndex("nations_owner_id_idx").on(t.ownerId),
}));

export const nationsRelations = relations(nations, ({ one, many }) => ({
  owner: one(users, {
    fields: [nations.ownerId],
    references: [users.id],
  }),
  actions: many(nationActions),
}));

/**
 * ──────────────────────────────────────────────────────────────────────────
 * NATION ACTIONS  (the thing intel visibility actually gates)
 * ──────────────────────────────────────────────────────────────────────────
 * Phase 1 stub: enough structure to test and enforce the visibility rule
 * end-to-end, without building the full gameplay system yet. A real
 * "action" in phase 2 will reference this row's id and add details.
 */
export const nationActions = pgTable("nation_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  nationId: uuid("nation_id").notNull().references(() => nations.id, { onDelete: "cascade" }),

  week: integer("week").notNull(),
  category: text("category").notNull(), // 'military' | 'diplomacy' | 'trade' | etc (free text in phase 1)
  description: text("description").notNull(),

  // Confidentiality level this action was filed at — defaults to the
  // nation's intelRank at time of filing, but stored independently so a
  // later intel-rank change doesn't retroactively change old actions'
  // visibility (matches how the prior single-file prototype behaved).
  confidentialityLevel: integer("confidentiality_level").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  nationWeekIdx: index("nation_actions_nation_week_idx").on(t.nationId, t.week),
}));

export const nationActionsRelations = relations(nationActions, ({ one }) => ({
  nation: one(nations, {
    fields: [nationActions.nationId],
    references: [nations.id],
  }),
}));

/**
 * ──────────────────────────────────────────────────────────────────────────
 * AUDIT LOG
 * ──────────────────────────────────────────────────────────────────────────
 * Every privileged mutation (assignment changes, role changes, intel rank
 * changes, turn advances done on behalf of a nation, etc.) is recorded.
 * This is non-negotiable for a multi-GM system: you need to be able to
 * answer "who changed what, when" without trusting client-side claims.
 */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(), // e.g. "nation.assign", "user.role.change", "intel.rank.change"
  targetType: text("target_type").notNull(), // "user" | "nation" | "action"
  targetId: uuid("target_id"),
  metadata: text("metadata"), // JSON-encoded diff/context; kept as text to avoid jsonb migration churn in phase 1
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  actorIdx: index("audit_log_actor_idx").on(t.actorUserId),
  createdAtIdx: index("audit_log_created_at_idx").on(t.createdAt),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(users, {
    fields: [auditLog.actorUserId],
    references: [users.id],
  }),
}));

/**
 * ──────────────────────────────────────────────────────────────────────────
 * AUTH.JS REQUIRED TABLES (Drizzle adapter contract)
 * ──────────────────────────────────────────────────────────────────────────
 * These follow the exact shape @auth/drizzle-adapter expects. Do not rename
 * columns — the adapter queries them by these exact names.
 */
export const accounts = pgTable("accounts", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
}, (t) => ({
  pk: uniqueIndex("accounts_provider_idx").on(t.provider, t.providerAccountId),
}));

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
}, (t) => ({
  pk: uniqueIndex("verification_tokens_pk").on(t.identifier, t.token),
}));
