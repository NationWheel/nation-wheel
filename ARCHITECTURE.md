# Nation Wheel — Foundation Architecture (Phase 1)

This phase delivers authentication, authorization, nation ownership, and
the intelligence-rank visibility system as a standalone, production-ready
foundation. It deliberately does **not** include the gameplay systems
(corps, infrastructure, espionnage, outcome wheel, etc.) from the original
single-file prototype — those are phase 2, built on top of this.

## Stack

| Concern        | Choice                          | Why |
|-----------------|----------------------------------|-----|
| Hosting         | Vercel                          | Specified. |
| Framework       | Next.js 14 (App Router)         | API routes + frontend in one deployable, first-class Vercel support. |
| Auth            | Auth.js v5, Discord provider    | Handles OAuth flow/CSRF/session correctness; we don't hand-roll OAuth. |
| Session storage | Database strategy (not JWT)     | Lets us revoke a session immediately (ban a user, demote a GM) instead of waiting for a JWT to expire. |
| Database        | Vercel Postgres (Neon)          | Relational fits the ownership/permission model; serverless-safe pooling. |
| ORM             | Drizzle                         | Typed schema, SQL-shaped queries, lightweight migrations, no heavy runtime. |
| Validation      | Zod                             | Every API route validates its body before touching the DB. |

## Why this is a rewrite of the data layer, not an add-on

The original tool was a single HTML file persisting state to
`localStorage`. There is no concept of "a user" there — anyone with the
file can edit anything. Real authentication and authorization require a
server that can say no, and a database that is the single source of
truth independent of any one browser. That's what phase 1 is.

## Core invariants (the things that must never become false)

1. **One user owns at most one nation; one nation has at most one owner.**
   Enforced by a unique index on `nations.ownerId` plus application-level
   clearing of a user's prior nation on reassignment (`PATCH
   /api/admin/nations` — see the comment there for why a unique index
   alone isn't sufficient).

2. **Authorization checks live in exactly one file (`lib/authz.ts`).**
   No route handler inlines a `role === "admin"` check. Every privileged
   action calls `requireUser` / `requireGameMasterOrAdmin` / `requireAdmin`
   / `requireNationAccess`, which throw rather than return booleans — a
   route that forgets to call them has *no* protection, which is loud in
   review, instead of a silently-wrong check.

3. **Middleware is UX, not security.** `middleware.ts` redirects logged-out
   users for a better experience, but every API route and server
   component independently re-checks authorization. Deleting the
   middleware file should never make a privileged action *possible* that
   wasn't already blocked server-side — only less convenient to discover.

4. **The viewer's intel rank is always re-derived server-side from their
   own session, never trusted from the client.** See
   `app/api/nations/[nationId]/actions/route.ts` — `viewerRank` comes from
   `session.user.nation.intelRank`, which itself is populated fresh from
   the DB on every `auth()` call (see the session callback in
   `lib/auth.ts`). A client cannot claim a higher rank than its nation
   actually has.

5. **Role changes are admin-only; nation/intel changes are GM-or-admin.**
   A GM can run the game day-to-day (assign nations, set intel ranks,
   advance turns) but cannot grant themselves or anyone else GM/admin
   privileges. Only an admin can change platform roles.

## Intelligence visibility rule

Implemented in `lib/intel.ts`, kept deliberately free of any DB/network
code so it's trivially unit-testable and can't drift between two
half-duplicated implementations.

- A nation with intel rank `R` sees the full content of any action filed
  at confidentiality level `<= R`.
- Actions filed above `R` are **redacted, not hidden** — the API returns
  `{ id, nationId, week, redacted: true }` instead of omitting the row
  entirely. This is intentional: silently returning fewer rows would leak
  information too (an observer could infer "this nation took fewer
  actions" when actually they took the same number, just classified
  higher). Redaction preserves "something happened here" without leaking
  "what."
- A nation's own actions, and anything viewed by a GM/admin, bypass the
  rank check entirely (`hasFullVisibility` in `lib/authz.ts`).
- Turn status (`waiting` / `played`) and current week are **never**
  gated by intel rank — they're public per the spec ("basic public
  information may still remain visible").

## Database schema

See `db/schema.ts` for full definitions and inline rationale. Summary:

- **users** — one row per Discord account. Holds the platform role
  (`player` / `gamemaster` / `admin`) and an `isActive` flag for soft
  disabling.
- **nations** — identity, optional owner, per-nation `currentWeek` +
  `turnStatus`, and `intelRank`. No gameplay state yet — that's phase 2.
- **nation_actions** — minimal stub (week, category, description,
  confidentiality level) that exists purely to make the visibility rule
  testable end-to-end before the real action system is migrated.
- **audit_log** — every privileged mutation (role change, nation
  assignment, intel rank change, turn advance) is recorded with actor,
  action, target, and a JSON metadata blob. Non-negotiable for a
  multi-GM system — you need to be able to answer "who did this" without
  trusting client claims after the fact.
- **accounts / sessions / verification_tokens** — Auth.js's own tables,
  exact shape required by `@auth/drizzle-adapter`. Don't rename columns.

## API surface (phase 1)

| Route                                   | Method | Who | Purpose |
|------------------------------------------|--------|-----|---------|
| `/api/auth/[...nextauth]`                | *      | anyone | Auth.js OAuth flow |
| `/api/nations`                           | GET    | any authenticated user | Public waiting/played board |
| `/api/nations/:nationId/actions`         | GET    | any authenticated user | Redacted action feed for one nation |
| `/api/turns`                             | POST   | nation owner | Mark own nation's turn played |
| `/api/turns`                             | PATCH  | GM/admin | Advance one nation's week |
| `/api/intel`                             | PATCH  | GM/admin | Set a nation's intel rank |
| `/api/admin/nations`                     | GET    | GM/admin | Full nation roster (with owner info) |
| `/api/admin/nations`                     | POST   | GM/admin | Create a new nation |
| `/api/admin/nations`                     | PATCH  | GM/admin | Assign/unassign nation ownership |
| `/api/admin/users`                       | GET    | GM/admin | User roster |
| `/api/admin/users`                       | PATCH  | admin only | Change a user's platform role |

## Pages

- `/login` — Discord sign-in button.
- `/dashboard` — the waiting/played board + your own nation status.
  Visible to every authenticated user.
- `/admin` — nation assignment + intel rank management (GM and admin);
  user role management (admin only). Gated at the middleware layer for
  UX and re-checked server-side in the page component and every API call
  it makes.

## Setup checklist

1. **Discord application** (already created — Client ID
   `1518165332039045150`, project "Nation Wheel"). In the Developer
   Portal, under OAuth2:
   - Add redirect URI: `https://<your-vercel-domain>/api/auth/callback/discord`
     (and `http://localhost:3000/api/auth/callback/discord` for local dev).
   - Copy the **Client Secret** — paste into `AUTH_DISCORD_SECRET`.

2. **Vercel Postgres**: in the Vercel dashboard, Storage tab → Create
   Database → Postgres → connect it to this project. This auto-populates
   `POSTGRES_URL` etc. in your Vercel env vars.

3. **Generate `AUTH_SECRET`**: run `npx auth secret` and put the result in
   your Vercel env vars (and `.env.local` for local dev).

4. **Run migrations**: `npm run db:generate` then `npm run db:migrate`
   (point `POSTGRES_URL` at your Vercel Postgres connection string,
   pulled locally via `vercel env pull .env.local`).

5. **Sign in once** via Discord in the deployed app — this creates your
   `users` row as a `player`.

6. **Bootstrap your admin account**:
   `npm run seed:admin -- <your-discord-user-id>`
   (right-click your name in Discord with Developer Mode enabled → Copy
   User ID).

7. From then on, manage everyone else's roles and nation assignments
   through `/admin` — the seed script should never need to run again
   except disaster recovery.

## What phase 2 will need to do

- Migrate the gameplay tables (corps, infrastructure, espionnage state,
  outcome wheel config, etc.) referencing `nations.id` as the foreign key,
  the same way `nation_actions` already does.
- Replace the `nation_actions` stub with the real weekly-action system,
  preserving the `confidentialityLevel` column and the redaction
  contract — nothing about the visibility rule should need to change,
  only what counts as "an action."
- Add real-time updates (polling or WebSockets) for the waiting/played
  board and action feeds, if live updates become a requirement — phase 1
  intentionally ships with server-rendered + manual-refresh semantics
  since that wasn't specified as a hard requirement yet.
- Decide whether nation-vs-nation actions (e.g. an espionnage action
  *targeting* another nation) need a `targetNationId` column and an
  additional visibility rule (does the target always see attacks against
  them, regardless of rank?) — this wasn't specified yet and shouldn't be
  assumed.
