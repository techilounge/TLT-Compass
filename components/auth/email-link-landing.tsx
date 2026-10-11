"use client";

import { useEffect, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";

/** Support Supabase's default invite/recovery links without exposing tokens to the server. */
export function EmailLinkLanding() {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const type = params.get("type");
    if (params.has("error_code")) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
      window.location.replace("/login?notice=email-link-expired");
      return;
    }
    if (type !== "invite" && type !== "recovery") return;
    started.current = true;
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!access_token || !refresh_token || !url || !key) {
      window.location.replace("/login?notice=email-link-incomplete");
      return;
    }
    const db = createBrowserClient(url, key, {
      isSingleton: false,
      auth: { detectSessionInUrl: false },
    });
    void (async () => {
      try {
        const { error } = await db.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error) throw error;
        const { data, error: verificationError } = await db.auth.getUser();
        if (verificationError || !data.user) throw new Error("Invalid session");
        window.location.replace("/account/password");
      } catch {
        await db.auth.signOut({ scope: "local" }).catch(() => {});
        window.location.replace("/login?notice=email-link-session");
      }
    })();
  }, []);
  return null;
}
