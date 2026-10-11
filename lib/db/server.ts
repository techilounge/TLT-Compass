import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { parseSupabasePublicEnvironment } from "@/lib/validation/environment";
export async function createDatabaseClient() {
  const config = parseSupabasePublicEnvironment(process.env);
  if (config.status === "unconfigured") return null;
  const cookieStore = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          /* Server Components cannot set cookies; proxy refreshes sessions. */
        }
      },
    },
  });
}
