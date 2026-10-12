import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AIError,
  classifyStatus,
  endpointFor,
  type Model,
  type Provider,
} from "../../modules/ai/contracts";
import { routeAI, type RouteAttempt } from "../../modules/ai/router";
const provider = (id: string, priority: number): Provider => ({
  id,
  name: id,
  provider_type: "openai_compatible",
  base_url: "https://api.example.test/v1",
  credential_secret_ref: "AI_SECRET_TEST",
  priority,
  enabled: true,
  privacy_approved: true,
});
const model = (id: string, provider_id: string, priority: number): Model => ({
  id,
  provider_id,
  model_id: id,
  purposes: ["assistant_chat"],
  priority,
  enabled: true,
  context_limit: 4096,
  max_output_tokens: 128,
  price_in_per_million: 1,
  price_out_per_million: 2,
  configuration_fault: false,
  circuit_until: null,
});
const ok = () =>
  new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: "stop",
          message: { content: '{"answer":"synthetic"}' },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
  );
function fixture(fetcher: typeof fetch) {
  const attempts: RouteAttempt[] = [];
  return {
    attempts,
    input: {
      purpose: "assistant_chat" as const,
      providers: [provider("second", 2), provider("first", 1)],
      models: [
        model("a", "first", 1),
        model("b", "first", 2),
        model("c", "second", 1),
      ],
      system: "Return JSON.",
      prompt: "Synthetic input",
      schema: z.object({ answer: z.string() }).strict(),
      maxTokens: 64,
      maxCostUsd: 1,
      timeoutMs: 1000,
      maxAttempts: 3,
      allowedOrigins: ["https://api.example.test"],
      resolveSecret: () => "synthetic-test-credential",
      reserve: async () => "reservation",
      finish: async (_id: string, attempt: RouteAttempt) => {
        attempts.push({ ...attempt });
      },
      fetcher,
    },
  };
}
describe("AI bounded routing", () => {
  it("classifies permission failures and rejects unapproved destinations", () => {
    expect(classifyStatus(403)).toBe("permission");
    expect(classifyStatus(429)).toBe("rate_limit");
    for (const url of [
      "http://api.example.test",
      "https://localhost",
      "https://api.example.test.evil",
      "https://user:pass@api.example.test",
      "https://api.example.test?secret=x",
    ])
      expect(() =>
        endpointFor({ provider_type: "gemini", base_url: url }, "model", [
          "https://api.example.test",
        ]),
      ).toThrow(AIError);
  });
  it("uses model fallback then provider fallback on bounded 5xx", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("private error", { status: 503 }))
      .mockResolvedValueOnce(new Response("private error", { status: 503 }))
      .mockResolvedValueOnce(ok());
    const f = fixture(fetcher);
    expect(await routeAI(f.input)).toEqual({ answer: "synthetic" });
    expect(f.attempts.map((a) => a.modelId)).toEqual(["a", "b", "c"]);
    expect(JSON.stringify(f.attempts)).not.toContain("private error");
  });
  it.each([401, 403, 429])(
    "skips remaining provider models on %s",
    async (status) => {
      const f = fixture(
        vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(new Response("secret", { status }))
          .mockResolvedValueOnce(ok()),
      );
      await routeAI(f.input);
      expect(f.attempts.map((a) => a.modelId)).toEqual(["a", "c"]);
    },
  );
  it("does not retry schema/safety errors or accounting failures", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { content: '{"unexpected":true}' },
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      ),
    );
    const f = fixture(fetcher);
    await expect(routeAI(f.input)).rejects.toMatchObject({
      code: "invalid_output",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const g = fixture(vi.fn<typeof fetch>().mockResolvedValue(ok()));
    g.input.finish = async () => {
      throw new Error("database unavailable");
    };
    await expect(routeAI(g.input)).rejects.toThrow("database unavailable");
    expect(g.input.fetcher).toHaveBeenCalledTimes(1);
  });
  it("blocks incompatible, unapproved and overspend routes before inference", async () => {
    const f = fixture(vi.fn<typeof fetch>());
    f.input.providers.forEach((p) => (p.privacy_approved = false));
    await expect(routeAI(f.input)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(f.input.fetcher).not.toHaveBeenCalled();
    const g = fixture(vi.fn<typeof fetch>());
    g.input.maxCostUsd = 0.00000001;
    await expect(routeAI(g.input)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(g.input.fetcher).not.toHaveBeenCalled();
  });
});
