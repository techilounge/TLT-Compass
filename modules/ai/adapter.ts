import { z } from "zod";
import {
  AIError,
  classifyStatus,
  endpointFor,
  type Provider,
} from "./contracts";
const usage = z.number().int().nonnegative().max(10000000);
const openaiResponse = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable(),
        message: z.object({
          content: z.string().nullable(),
          refusal: z.string().nullish(),
        }),
      }),
    )
    .min(1),
  usage: z.object({ prompt_tokens: usage, completion_tokens: usage }),
});
const anthropicResponse = z.object({
  stop_reason: z.string().nullable(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  usage: z.object({ input_tokens: usage, output_tokens: usage }),
});
const geminiResponse = z.object({
  candidates: z
    .array(
      z.object({
        finishReason: z.string().optional(),
        content: z
          .object({
            parts: z.array(
              z.object({
                text: z.string().optional(),
                thought: z.boolean().optional(),
              }),
            ),
          })
          .optional(),
      }),
    )
    .min(1),
  usageMetadata: z.object({
    promptTokenCount: usage,
    candidatesTokenCount: usage.optional(),
    totalTokenCount: usage,
  }),
});
export type AdapterResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};
export async function inferText(input: {
  provider: Provider;
  model: string;
  key: string;
  system: string;
  prompt: string;
  maxTokens: number;
  timeoutMs: number;
  allowedOrigins: readonly string[];
  fetcher?: typeof fetch;
}): Promise<AdapterResult> {
  const { provider, model, key, system, prompt, maxTokens } = input;
  const url = endpointFor(provider, model, input.allowedOrigins);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  let body: unknown;
  if (provider.provider_type === "anthropic") {
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
    body = {
      model,
      system,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
    };
  } else if (provider.provider_type === "gemini") {
    headers["x-goog-api-key"] = key;
    body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    };
  } else {
    headers.Authorization = `Bearer ${key}`;
    body = {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      ...(provider.provider_type === "openrouter"
        ? { max_tokens: maxTokens }
        : { max_completion_tokens: maxTokens }),
      stream: false,
    };
  }
  const signal = AbortSignal.timeout(input.timeoutMs);
  let response: Response;
  try {
    response = await (input.fetcher ?? fetch)(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new AIError(signal.aborted ? "timeout" : "network");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new AIError(classifyStatus(response.status));
  }
  // Bound streamed bytes even if Content-Length is absent or forged.
  const reader = response.body?.getReader();
  if (!reader) throw new AIError("invalid_output");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 512 * 1024) {
        await reader.cancel();
        throw new AIError("invalid_output");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof AIError) throw error;
    throw new AIError(signal.aborted ? "timeout" : "network");
  }
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    const json: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (JSON.stringify(json).includes(key)) throw new AIError("invalid_output");
    if (provider.provider_type === "anthropic") {
      const r = anthropicResponse.parse(json);
      if (r.stop_reason !== "end_turn")
        throw new AIError(
          r.stop_reason === "refusal" ? "safety" : "invalid_output",
        );
      return {
        text: r.content
          .filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join(""),
        inputTokens: r.usage.input_tokens,
        outputTokens: r.usage.output_tokens,
      };
    }
    if (provider.provider_type === "gemini") {
      const r = geminiResponse.parse(json),
        c = r.candidates[0];
      if (c.finishReason !== "STOP")
        throw new AIError(
          ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT"].includes(
            c.finishReason ?? "",
          )
            ? "safety"
            : "invalid_output",
        );
      return {
        text:
          c.content?.parts
            .filter((p) => !p.thought)
            .map((p) => p.text ?? "")
            .join("") ?? "",
        inputTokens: r.usageMetadata.promptTokenCount,
        outputTokens:
          r.usageMetadata.totalTokenCount - r.usageMetadata.promptTokenCount,
      };
    }
    const r = openaiResponse.parse(json),
      c = r.choices[0];
    if (c.message.refusal || c.finish_reason === "content_filter")
      throw new AIError("safety");
    if (c.finish_reason !== "stop" || !c.message.content)
      throw new AIError("invalid_output");
    return {
      text: c.message.content,
      inputTokens: r.usage.prompt_tokens,
      outputTokens: r.usage.completion_tokens,
    };
  } catch (error) {
    if (error instanceof AIError) throw error;
    throw new AIError("invalid_output");
  }
}
