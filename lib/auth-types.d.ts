import type { DefaultSession } from "next-auth";
import type { AccountRole } from "@/lib/authz";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AccountRole;
      isActive: boolean;
      discordUsername: string | null;
      nation: {
        id: string;
        name: string;
        currentWeek: number;
        turnStatus: "waiting" | "played";
        intelRank: number;
      } | null;
    } & DefaultSession["user"];
  }
}
