import { z } from "zod";

// PR 1 permits an unconfigured shell; partially configured integrations fail closed.
const configured = z.object({
  url: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (process.env.NODE_ENV !== "production" &&
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname))
    );
  }, "HTTPS required except local development"),
  publishableKey: z.string().min(1),
});
export function parseSupabasePublicEnvironment(
  env: Record<string, string | undefined>,
) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url && !publishableKey) return { status: "unconfigured" as const };
  return {
    status: "configured" as const,
    ...configured.parse({ url, publishableKey }),
  };
}
