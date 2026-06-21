import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Middleware is a UX convenience layer ONLY — it improves the experience
 * by redirecting unauthenticated visitors before they see a protected
 * page render. It is NOT the security boundary. Every API route and every
 * server component still independently calls requireUser/requireAdmin/etc.
 * from lib/authz.ts. If this file were deleted entirely, no privileged
 * action should become possible — that's the test for "is this actually
 * secure" vs. "is this just a nice redirect."
 */
export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  const isAdminRoute = pathname.startsWith("/admin");
  const isDashboardRoute = pathname.startsWith("/dashboard");
  const isProtectedApi =
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/nations") ||
    pathname.startsWith("/api/turns") ||
    pathname.startsWith("/api/intel");

  if (!isLoggedIn && (isAdminRoute || isDashboardRoute || isProtectedApi)) {
    if (isProtectedApi) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Coarse admin-route gate at the edge: full role check still happens
  // server-side in requireAdmin() / requireGameMasterOrAdmin(), this just
  // avoids shipping the admin page shell to obviously-unauthorized users.
  if (isAdminRoute && isLoggedIn) {
    const role = req.auth?.user?.role;
    if (role !== "admin" && role !== "gamemaster") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/api/admin/:path*", "/api/nations/:path*", "/api/turns/:path*", "/api/intel/:path*"],
};
