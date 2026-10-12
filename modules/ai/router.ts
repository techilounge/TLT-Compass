import { z } from "zod";
import {
  AIError,
  type AIErrorCode,
  type AIPurpose,
  type Model,
  type Provider,
} from "./contracts";
import { inferText } from "./adapter";
export type RouteAttempt = {
  modelId: string;
  providerId: string;
  status: "succeeded" | "failed";
  errorCode: AIErrorCode | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  reservedUsd: number;
};
export async function routeAI<T>(input: {
  purpose: AIPurpose;
  providers: Provider[];
  models: Model[];
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens: number;
  maxCostUsd: number;
  timeoutMs: number;
  maxAttempts: number;
  allowedOrigins: readonly string[];
  resolveSecret: (
    ref: string,
    providerId: string,
  ) => string | undefined | Promise<string | undefined>;
  reserve: (attempt: RouteAttempt) => Promise<string>;
  finish: (id: string, attempt: RouteAttempt) => Promise<void>;
  fetcher?: typeof fetch;
}) {
  if (input.purpose === "vision") throw new AIError("unavailable"); // Text transport must never claim image capability.
  if (
    input.prompt.length + input.system.length > 24000 ||
    input.maxCostUsd <= 0
  )
    throw new AIError("budget");
  const providers = input.providers
    .filter((p) => p.enabled && p.privacy_approved)
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  let attempts = 0,
    reservedTotal = 0;
  for (const provider of providers) {
    const models = input.models
      .filter(
        (m) =>
          m.provider_id === provider.id &&
          m.enabled &&
          !m.configuration_fault &&
          (!m.circuit_until || Date.parse(m.circuit_until) <= Date.now()) &&
          m.purposes.includes(input.purpose),
      )
      .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    for (const model of models) {
      if (attempts >= input.maxAttempts) throw new AIError("unavailable");
      const maxTokens = Math.min(input.maxTokens, model.max_output_tokens);
      // UTF-8 bytes plus protocol overhead is a deliberately conservative token bound.
      const maxInput =
        new TextEncoder().encode(input.system + input.prompt).length + 512;
      if (maxInput + maxTokens > model.context_limit) continue;
      const reservedUsd =
        (maxInput * model.price_in_per_million +
          maxTokens * model.price_out_per_million) /
        1000000;
      if (reservedTotal + reservedUsd > input.maxCostUsd) continue;
      const attempt: RouteAttempt = {
        modelId: model.id,
        providerId: provider.id,
        status: "failed",
        errorCode: null,
        latencyMs: 0,
        inputTokens: null,
        outputTokens: null,
        reservedUsd,
      };
      const reservation = await input.reserve(attempt);
      reservedTotal += reservedUsd;
      attempts++;
      const start = Date.now();
      let result: T | undefined;
      let success = false;
      try {
        const key = await input.resolveSecret(
          provider.credential_secret_ref,
          provider.id,
        );
        if (!key) throw new AIError("credentials");
        const response = await inferText({
          provider,
          model: model.model_id,
          key,
          system: input.system,
          prompt: input.prompt,
          maxTokens,
          timeoutMs: input.timeoutMs,
          allowedOrigins: input.allowedOrigins,
          fetcher: input.fetcher,
        });
        attempt.inputTokens = response.inputTokens;
        attempt.outputTokens = response.outputTokens;
        try {
          result = input.schema.parse(JSON.parse(response.text));
        } catch {
          throw new AIError("invalid_output");
        }
        attempt.status = "succeeded";
        success = true;
      } catch (error) {
        attempt.errorCode =
          error instanceof AIError ? error.code : "unavailable";
      }
      attempt.latencyMs = Date.now() - start;
      // Persistence failures abort routing; never retry paid inference after accounting fails.
      await input.finish(reservation, attempt);
      if (success) return result as T;
      if (
        ["invalid_output", "safety", "budget"].includes(attempt.errorCode ?? "")
      )
        throw new AIError(attempt.errorCode!);
      if (
        ["credentials", "permission", "configuration", "rate_limit"].includes(
          attempt.errorCode ?? "",
        )
      )
        break;
    }
  }
  throw new AIError("unavailable");
}
