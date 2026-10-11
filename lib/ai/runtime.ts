import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { routeAI } from "@/modules/ai/router";
import {
  AIError,
  modelInput,
  providerInput,
  purposes,
  type AIPurpose,
  type Model,
  type Provider,
} from "@/modules/ai/contracts";
import type { requireClub } from "@/lib/auth/session";
import { withAIConnection } from "./accounting";
import { decryptCredential } from "./credentials";
type Database = Awaited<ReturnType<typeof requireClub>>["db"];
export const allowedAIOrigins = () =>
  (
    process.env.AI_ALLOWED_ORIGINS ??
    "https://api.openai.com,https://openrouter.ai,https://api.anthropic.com,https://generativelanguage.googleapis.com"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
export async function verifiedAIClaims(db: Database) {
  const result = await db.auth.getClaims();
  if (result.error) throw new AIError("permission");
  const claims = z
    .object({ sub: z.string().uuid(), aal: z.literal("aal2") })
    .safeParse(result.data?.claims);
  if (!claims.success) throw new AIError("permission");
  return claims.data;
}
export async function runStaffAI<T>(
  db: Database,
  clubId: string,
  input: {
    purpose: AIPurpose;
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
    onlyModel?: string;
  },
) {
  const claims = await verifiedAIClaims(db);
  const [settings, providers, models] = await Promise.all([
    db.from("ai_settings").select("*").eq("club_id", clubId).maybeSingle(),
    db.from("ai_providers").select("*").eq("club_id", clubId).limit(100),
    db.from("ai_models").select("*").eq("club_id", clubId).limit(500),
  ]);
  if (
    settings.error ||
    providers.error ||
    models.error ||
    !settings.data?.enabled
  )
    throw new AIError("unavailable");
  const configuredProviders: Provider[] = (providers.data ?? []).map((p) => ({
    ...providerInput.parse(p),
    id: p.id,
  }));
  const configuredModels: Model[] = (models.data ?? [])
    .filter((m) => !input.onlyModel || m.id === input.onlyModel)
    .map((m) => ({
      ...modelInput.parse(m),
      id: m.id,
      provider_id: m.provider_id,
      configuration_fault: m.configuration_fault,
      circuit_until: m.circuit_until,
    }));
  const traceId = randomUUID(),
    inputBound =
      new TextEncoder().encode(input.system + input.prompt).length + 512;
  return routeAI({
    ...input,
    providers: configuredProviders,
    models: configuredModels,
    maxTokens: input.onlyModel
      ? Math.min(64, settings.data.max_output_tokens)
      : settings.data.max_output_tokens,
    maxCostUsd: Number(settings.data.request_ceiling_usd),
    timeoutMs: settings.data.timeout_ms,
    maxAttempts: input.onlyModel ? 1 : settings.data.max_attempts,
    allowedOrigins: allowedAIOrigins(),
    resolveSecret: async (ref, providerId) => {
      const encrypted = await withAIConnection(
        claims,
        async (client) =>
          (
            await client.query<{ value: string | null }>(
              "select public.read_ai_credential($1,$2) value",
              [clubId, providerId],
            )
          ).rows[0]?.value,
      );
      return encrypted
        ? decryptCredential(encrypted, providerId)
        : /^AI_SECRET_[A-Z0-9_]{1,60}$/.test(ref)
          ? process.env[ref]
          : undefined;
    },
    reserve: async (attempt) =>
      withAIConnection(claims, async (client) => {
        const model = configuredModels.find((m) => m.id === attempt.modelId)!;
        const result = await client.query<{ id: string }>(
          "select public.reserve_ai_attempt($1,$2,$3,$4,$5,$6) id",
          [
            clubId,
            attempt.modelId,
            input.purpose,
            traceId,
            inputBound,
            Math.min(
              input.onlyModel ? 64 : settings.data.max_output_tokens,
              model.max_output_tokens,
            ),
          ],
        );
        return result.rows[0].id;
      }),
    finish: async (id, attempt) =>
      withAIConnection(claims, async (client) => {
        await client.query(
          "select public.finish_ai_attempt($1,$2,$3,$4,$5,$6)",
          [
            id,
            attempt.status,
            attempt.errorCode,
            attempt.latencyMs,
            attempt.inputTokens,
            attempt.outputTokens,
          ],
        );
      }),
  });
}
export async function testAIModel(
  db: Database,
  clubId: string,
  modelId: string,
) {
  const result = await db
    .from("ai_models")
    .select("purposes")
    .eq("club_id", clubId)
    .eq("id", modelId)
    .single();
  const purpose = z
    .array(z.enum(purposes))
    .parse(result.data?.purposes)
    .find((p) => p !== "vision");
  if (!purpose) throw new AIError("unavailable");
  return runStaffAI(db, clubId, {
    purpose,
    onlyModel: modelId,
    system:
      'Return JSON only: {"marker":"TLT_SYNTHETIC_OK"}. Synthetic test without personal data.',
    prompt: "Run synthetic test.",
    schema: z.object({ marker: z.literal("TLT_SYNTHETIC_OK") }).strict(),
  });
}
