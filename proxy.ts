import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { parseSupabasePublicEnvironment } from "@/lib/validation/environment";
export async function proxy(request: NextRequest) {
  const config = parseSupabasePublicEnvironment(process.env);
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64"),
    isDev = process.env.NODE_ENV === "development";
  const supabaseOrigin =
    config.status === "unconfigured" ? "" : new URL(config.url).origin;
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${supabaseOrigin}${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const next = () =>
    NextResponse.next({ request: { headers: requestHeaders } });
  let response = next();
  const finish = () => {
    response.headers.set("Content-Security-Policy", policy);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  if (
    config.status === "unconfigured" ||
    !/^\/(workspace|login|account|auth)(\/|$)/.test(request.nextUrl.pathname)
  )
    return finish();
  const client = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        requestHeaders.set("cookie", request.cookies.toString());
        response = next();
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  await client.auth.getUser();
  return finish();
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|app-icon|manifest.webmanifest).*)",
  ],
};
