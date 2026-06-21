import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db/client";
import { users, accounts, sessions, verificationTokens, nations } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Auth.js v5 setup.
 *
 * Why Discord-only, why this exact scope:
 *   - `identify` is enough to get id/username/avatar — we deliberately do
 *     NOT request `email` or `guilds` scopes. We don't need a Discord
 *     email (login is by Discord identity, not email) and we don't need
 *     guild membership for phase 1. Requesting scopes you don't use is
 *     both a security smell and something Discord's app review will
 *     eventually flag if this ever needs elevated verification.
 *
 * Why the session callback does a DB read every time:
 *   - Role and nation ownership can change at runtime (a GM can demote
 *     a player, reassign a nation, etc.). If we baked `role` into the JWT
 *     at login and never refreshed it, a demoted user would keep GM
 *     powers in their session token until it expired. Session callback
 *     runs on every `auth()` call server-side, so this read is cheap and
 *     keeps authorization data live. We explicitly do NOT want to "trust
 *     the token" for anything privilege-related.
 */

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Discord({
      authorization: { params: { scope: "identify" } },
      profile(profile) {
        return {
          id: profile.id,
          name: profile.username,
          email: null,
          image: profile.avatar
            ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
            : null,
          // Custom fields consumed by the adapter's createUser mapping —
          // see lib/auth-adapter-mapping.ts note below.
          discordId: profile.id,
          discordUsername: profile.username,
          discordAvatar: profile.avatar,
        };
      },
    }),
  ],
  session: {
    strategy: "database", // not JWT — lets us revoke sessions server-side (kick a banned user immediately)
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async session({ session, user }) {
      const dbUser = await db.query.users.findFirst({
        where: eq(users.id, user.id),
      });

      const ownedNation = dbUser
        ? await db.query.nations.findFirst({
            where: eq(nations.ownerId, dbUser.id),
            columns: { id: true, name: true, currentWeek: true, turnStatus: true, intelRank: true },
          })
        : null;

      session.user.id = user.id;
      session.user.role = dbUser?.role ?? "player";
      session.user.isActive = dbUser?.isActive ?? true;
      session.user.discordUsername = dbUser?.discordUsername ?? null;
      session.user.nation = ownedNation ?? null;

      return session;
    },
  },
});
