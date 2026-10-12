import { randomBytes } from "node:crypto";
import { expect, it } from "vitest";
import { sealCredential, openCredential } from "../../modules/ai/crypto";
it("encrypts credentials with unique nonces and binds them to their provider", () => {
  const key = randomBytes(32),
    raw = "synthetic-test-only-credential",
    a = sealCredential(raw, "provider-a", key),
    b = sealCredential(raw, "provider-a", key);
  expect(a).not.toBe(b);
  expect(a).not.toContain(raw);
  expect(openCredential(a, "provider-a", key)).toBe(raw);
  expect(() => openCredential(a, "provider-b", key)).toThrow();
  expect(() => openCredential(a, "provider-a", randomBytes(32))).toThrow();
  const parts = a.split(".");
  parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);
  expect(() => openCredential(parts.join("."), "provider-a", key)).toThrow();
});
