import { z } from "zod";
export const purposes = [
  "assistant_chat",
  "calendar_extract",
  "question_generation",
  "summarization",
  "vision",
] as const;
export type AIPurpose = (typeof purposes)[number];
export const providerTypes = [
  "openai_compatible",
  "openrouter",
  "anthropic",
  "gemini",
] as const;
export const providerInput = z.object({
  name: z.string().trim().min(1).max(80),
  provider_type: z.enum(providerTypes),
  base_url: z.string().url().max(300),
  credential_secret_ref: z.string().regex(/^AI_SECRET_[A-Z0-9_]{1,60}$/),
  priority: z.coerce.number().int().min(0).max(1000),
  enabled: z.boolean(),
  privacy_approved: z.boolean(),
});
export const modelInput = z.object({
  model_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/),
  purposes: z.array(z.enum(purposes)).min(1).max(5),
  priority: z.coerce.number().int().min(0).max(1000),
  context_limit: z.coerce.number().int().min(256).max(2000000),
  max_output_tokens: z.coerce.number().int().min(32).max(16384),
  price_in_per_million: z.coerce.number().min(0).max(10000),
  price_out_per_million: z.coerce.number().min(0).max(10000),
  enabled: z.boolean(),
});
export type Provider = z.infer<typeof providerInput> & { id: string };
export type Model = z.infer<typeof modelInput> & {
  id: string;
  provider_id: string;
  configuration_fault: boolean;
  circuit_until: string | null;
};
export type AIErrorCode =
  | "credentials"
  | "permission"
  | "configuration"
  | "rate_limit"
  | "upstream"
  | "timeout"
  | "network"
  | "invalid_output"
  | "safety"
  | "budget"
  | "unavailable";
export class AIError extends Error {
  constructor(public readonly code: AIErrorCode) {
    super(`AI request failed: ${code}`);
  }
}
export function classifyStatus(status: number): AIErrorCode {
  if (status === 401) return "credentials";
  if (status === 403) return "permission";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "upstream";
  return "configuration";
}
export function endpointFor(
  provider: Pick<Provider, "provider_type" | "base_url">,
  model: string,
  allowedOrigins: readonly string[],
) {
  const base = new URL(provider.base_url);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    !allowedOrigins.includes(base.origin)
  )
    throw new AIError("configuration");
  const path =
    provider.provider_type === "anthropic"
      ? "messages"
      : provider.provider_type === "gemini"
        ? `models/${encodeURIComponent(model)}:generateContent`
        : "chat/completions";
  return new URL(
    `${base.pathname.replace(/\/$/, "")}/${path}`,
    base.origin,
  ).toString();
}
