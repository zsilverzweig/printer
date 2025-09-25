import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js 14 Middleware for Authentication and Route Protection
 *
 * This runs at the edge before any page renders, providing:
 * - Server-side authentication checks
 * - Route protection
 * - Redirects before content loads
 * - Better security and performance
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get authentication token from cookies
  const authToken = request.cookies.get("auth-token")?.value;
  const userRole = request.cookies.get("user-role")?.value;
  const userStatus = request.cookies.get("user-status")?.value;

  // Public routes that don't require authentication
  const publicRoutes = [
    "/",
    "/login",
    "/signup",
    "/signup-info",
    "/waitlist",
    "/waitlist-signup",
    "/docs",
    "/api",
    "/_next",
    "/favicon.ico",
  ];

  // Check if current path is public
  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(route)
  );

  // If no auth token and trying to access protected route
  if (!authToken && !isPublicRoute) {
    console.log(`Redirecting unauthenticated user from ${pathname} to /login`);
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // If authenticated, handle route-specific logic
  if (authToken) {
    // Admin routes - require admin role
    if (pathname.startsWith("/admin")) {
      if (userRole !== "admin" && userRole !== "super_admin") {
        console.log(
          `Redirecting non-admin user from ${pathname} to /unauthorized`
        );
        return NextResponse.redirect(new URL("/unauthorized", request.url));
      }
    }

    // Handle user status-based routing
    if (userStatus) {
      // Pending users should complete profile setup
      if (
        userStatus === "pending" &&
        pathname !== "/signup-info" &&
        !pathname.startsWith("/signup")
      ) {
        console.log(
          `Redirecting pending user from ${pathname} to /signup-info`
        );
        return NextResponse.redirect(new URL("/signup-info", request.url));
      }

      // Waitlist users should see waitlist dashboard
      if (
        userStatus === "waitlist" &&
        pathname !== "/waitlist" &&
        !pathname.startsWith("/waitlist")
      ) {
        console.log(`Redirecting waitlist user from ${pathname} to /waitlist`);
        return NextResponse.redirect(new URL("/waitlist", request.url));
      }

      // Active users can access app features
      if (userStatus === "active" && pathname === "/signup-info") {
        console.log(`Redirecting active user from ${pathname} to /portfolios`);
        return NextResponse.redirect(new URL("/portfolios", request.url));
      }
    }
  }

  // Allow request to proceed
  return NextResponse.next();
}

// Configure which paths this middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
