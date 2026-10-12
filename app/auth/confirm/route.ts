import { NextResponse, type NextRequest } from "next/server";
import { createDatabaseClient } from "@/lib/db/server";
// Email templates use token_hash and an explicit invite/recovery type. Never log tokens.
export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const db = await createDatabaseClient();
  if (db && token_hash && (type === "invite" || type === "recovery")) {
    const { error } = await db.auth.verifyOtp({ token_hash, type });
    if (!error)
      return NextResponse.redirect(new URL("/account/password", request.url));
  }
  return NextResponse.redirect(new URL("/login?notice=invalid", request.url));
}
