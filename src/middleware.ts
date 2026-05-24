import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isOperatorAuthorized } from "./lib/operator-auth";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtectedPath =
    pathname === "/operator" ||
    pathname.startsWith("/operator/") ||
    pathname.startsWith("/api/operator/");

  if (!isProtectedPath) return NextResponse.next();

  const authorized = isOperatorAuthorized({
    authorizationHeader: request.headers.get("authorization"),
    operatorPassword: process.env.OPERATOR_PASSWORD,
  });

  if (authorized) return NextResponse.next();

  return new NextResponse("Operator access required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Trading Cup Operator"',
    },
  });
}

export const config = {
  matcher: ["/operator/:path*", "/api/operator/:path*"],
};
