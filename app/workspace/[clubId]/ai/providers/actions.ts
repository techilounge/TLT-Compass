"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import {
  endpointFor,
  modelInput,
  providerInput,
  purposes,
  AIError,
} from "@/modules/ai/contracts";
import { allowedAIOrigins, testAIModel } from "@/lib/ai/runtime";
import { verifiedAIClaims } from "@/lib/ai/runtime";
import { withAIConnection } from "@/lib/ai/accounting";
import { encryptCredential } from "@/lib/ai/credentials";
import { createClient } from "@supabase/supabase-js";
export async function configureAI(clubId: string, form: FormData) {
  if (!uuid.safeParse(clubId).success) redirect("/workspace");
  const { db, user } = await requireClub(clubId);
  const permission = await db.rpc("can_configure_ai", { target_club: clubId });
  if (permission.error || !permission.data)
    redirect(`/workspace/${clubId}/ai?notice=permission`);
  let notice = "saved";
  try {
    const operation = z
      .enum(["global", "settings", "provider", "model", "reset", "test", "key"])
      .parse(form.get("operation"));
    let result;
    if (operation === "global") {
      const input = z
        .object({
          monthly_budget: z.coerce.number().min(0).max(100000),
          minute_limit: z.coerce.number().int().min(1).max(10000),
          actor_minute_limit: z.coerce.number().int().min(1).max(100),
        })
        .parse(Object.fromEntries(form));
      result = await db.rpc("configure_global_ai", {
        ...input,
        ai_enabled: form.get("enabled") === "on",
      });
    } else if (operation === "settings") {
      const input = z
        .object({
          monthly_budget_usd: z.coerce.number().min(0).max(10000),
          role_monthly_budget_usd: z.coerce.number().min(0).max(10000),
          request_ceiling_usd: z.coerce.number().min(0).max(10),
          max_output_tokens: z.coerce.number().int().min(32).max(16384),
          timeout_ms: z.coerce.number().int().min(1000).max(20000),
          max_attempts: z.coerce.number().int().min(1).max(5),
          circuit_failures: z.coerce.number().int().min(1).max(10),
          cooldown_seconds: z.coerce.number().int().min(30).max(86400),
        })
        .parse(Object.fromEntries(form));
      result = await db.from("ai_settings").upsert({
        ...input,
        club_id: clubId,
        enabled: form.get("enabled") === "on",
      });
    } else if (operation === "provider") {
      const input = providerInput.parse({
        ...Object.fromEntries(form),
        enabled: form.get("enabled") === "on",
        privacy_approved: form.get("privacy_approved") === "on",
      });
      endpointFor(input, "synthetic", allowedAIOrigins());
      const id = form.get("id");
      result = id
        ? await db
            .from("ai_providers")
            .update(input)
            .eq("club_id", clubId)
            .eq("id", uuid.parse(id))
            .select("id")
            .single()
        : await db
            .from("ai_providers")
            .insert({ ...input, club_id: clubId, created_by: user.id });
    } else if (operation === "model") {
      const input = modelInput.parse({
        ...Object.fromEntries(form),
        purposes: form.getAll("purposes").map((p) => z.enum(purposes).parse(p)),
        enabled: form.get("enabled") === "on",
      });
      const id = form.get("id"),
        provider = uuid.parse(form.get("provider_id"));
      result = id
        ? await db
            .from("ai_models")
            .update(input)
            .eq("club_id", clubId)
            .eq("provider_id", provider)
            .eq("id", uuid.parse(id))
            .select("id")
            .single()
        : await db
            .from("ai_models")
            .insert({ ...input, club_id: clubId, provider_id: provider });
    } else if (operation === "key") {
      const id = uuid.parse(form.get("id"));
      const provider = await db
        .from("ai_providers")
        .select("id")
        .eq("club_id", clubId)
        .eq("id", id)
        .single();
      if (provider.error) throw new AIError("permission");
      const password = z.string().min(1).max(1024).parse(form.get("password")),
        key = z.string().trim().min(8).max(4000).parse(form.get("api_key"));
      if (!user.email) throw new AIError("permission");
      const verifier = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      );
      const verified = await verifier.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (verified.error || verified.data.user?.id !== user.id)
        throw new AIError("permission");
      const ciphertext = encryptCredential(key, id),
        claims = await verifiedAIClaims(db);
      await withAIConnection(claims, async (client) => {
        await client.query("select public.store_ai_credential($1,$2,$3)", [
          id,
          ciphertext,
          key.slice(-4),
        ]);
      });
    } else {
      const id = uuid.parse(form.get("id"));
      // Scope the object before invoking either control operation.
      const model = await db
        .from("ai_models")
        .select("id")
        .eq("club_id", clubId)
        .eq("id", id)
        .single();
      if (model.error) throw new AIError("unavailable");
      if (operation === "test") {
        await testAIModel(db, clubId, id);
        notice = "tested";
      } else result = await db.rpc("reset_ai_route", { target_model: id });
    }
    if (result?.error) throw new Error("Unable to save AI configuration");
  } catch (error) {
    notice = error instanceof AIError ? error.code : "validation";
  }
  revalidatePath(`/workspace/${clubId}/ai`, "layout");
  redirect(`/workspace/${clubId}/ai/providers?notice=${notice}`);
}
