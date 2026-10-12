import { describe, it, expect, vi } from "vitest";
import { inferText } from "../../modules/ai/adapter";
import type { Provider } from "../../modules/ai/contracts";
const base = {
  model: "synthetic-model",
  key: "synthetic-adapter-key",
  system: "Return JSON",
  prompt: "Synthetic",
  maxTokens: 64,
  timeoutMs: 1000,
  allowedOrigins: ["https://api.example.test"],
};
const provider = (type: Provider["provider_type"]): Provider => ({
  id: "test",
  name: "Test",
  provider_type: type,
  base_url: "https://api.example.test/v1",
  credential_secret_ref: "AI_SECRET_TEST",
  priority: 1,
  enabled: true,
  privacy_approved: true,
});
describe("typed provider adapters", () => {
  it("uses OpenRouter max_tokens and rejects leaked raw credential output", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            { finish_reason: "stop", message: { content: '{"ok":true}' } },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 4 },
        }),
      ),
    );
    expect(
      await inferText({ ...base, provider: provider("openrouter"), fetcher }),
    ).toMatchObject({ inputTokens: 10, outputTokens: 4 });
    const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(request.max_tokens).toBe(64);
    expect(request.max_completion_tokens).toBeUndefined();
    expect(fetcher.mock.calls[0][1]?.redirect).toBe("error");
    await expect(
      inferText({
        ...base,
        provider: provider("openrouter"),
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(
          new Response(
            JSON.stringify({
              choices: [
                { finish_reason: "stop", message: { content: base.key } },
              ],
              usage: { prompt_tokens: 1, completion_tokens: 1 },
            }),
          ),
        ),
      }),
    ).rejects.toMatchObject({ code: "invalid_output" });
  });
  it("extracts Anthropic text and validates stop state", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          stop_reason: "end_turn",
          content: [{ type: "text", text: '{"ok":true}' }],
          usage: { input_tokens: 8, output_tokens: 4 },
        }),
      ),
    );
    expect(
      (await inferText({ ...base, provider: provider("anthropic"), fetcher }))
        .text,
    ).toBe('{"ok":true}');
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://api.example.test/v1/messages",
    );
    expect(fetcher.mock.calls[0][1]?.headers).toHaveProperty(
      "anthropic-version",
      "2023-06-01",
    );
  });
  it("reports Gemini 403 as permission and excludes thoughts from successful output", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          '{"error":{"status":"PERMISSION_DENIED","message":"private-provider-detail"}}',
          { status: 403 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: "STOP",
                content: {
                  parts: [
                    { text: "private thought", thought: true },
                    { text: '{"ok":true}' },
                  ],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 4,
              totalTokenCount: 17,
            },
          }),
        ),
      );
    await expect(
      inferText({ ...base, provider: provider("gemini"), fetcher }),
    ).rejects.toMatchObject({
      code: "permission",
      message: "AI request failed: permission",
    });
    expect(
      await inferText({ ...base, provider: provider("gemini"), fetcher }),
    ).toEqual({ text: '{"ok":true}', inputTokens: 10, outputTokens: 7 });
  });
  it("bounds untrusted output and treats refusals as nonretryable safety failures", async () => {
    await expect(
      inferText({
        ...base,
        provider: provider("openai_compatible"),
        fetcher: vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response("x".repeat(524289))),
      }),
    ).rejects.toMatchObject({ code: "invalid_output" });
    await expect(
      inferText({
        ...base,
        provider: provider("openai_compatible"),
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(
          new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason: "content_filter",
                  message: { content: null, refusal: "No" },
                },
              ],
              usage: { prompt_tokens: 1, completion_tokens: 1 },
            }),
          ),
        ),
      }),
    ).rejects.toMatchObject({ code: "safety" });
  });
});
