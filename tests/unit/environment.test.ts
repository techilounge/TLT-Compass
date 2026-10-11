import { describe, expect, it } from "vitest";
import { parseSupabasePublicEnvironment } from "../../lib/validation/environment";
describe("public integration configuration", () => {
  it("allows the credential-free foundation", () => {
    expect(parseSupabasePublicEnvironment({}).status).toBe("unconfigured");
  });
  it("rejects partial and insecure configuration", () => {
    expect(() =>
      parseSupabasePublicEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      }),
    ).toThrow();
    expect(() =>
      parseSupabasePublicEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "http://example.com",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "key",
      }),
    ).toThrow();
  });
  it("excludes server secrets from returned configuration", () => {
    expect(
      parseSupabasePublicEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public",
        SUPABASE_SECRET_KEY: "private",
      }),
    ).toEqual({
      status: "configured",
      url: "https://example.supabase.co",
      publishableKey: "public",
    });
  });
});
