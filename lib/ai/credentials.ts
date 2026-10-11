import "server-only";
import { sealCredential, openCredential } from "@/modules/ai/crypto";
import { AIError } from "@/modules/ai/contracts";
function rootKey() {
  const raw = process.env.AI_CREDENTIAL_ENCRYPTION_KEY ?? "";
  if (!/^[a-f0-9]{64}$/i.test(raw)) throw new AIError("configuration");
  return Buffer.from(raw, "hex");
}
export function encryptCredential(raw: string, providerId: string) {
  return sealCredential(raw, providerId, rootKey());
}
export function decryptCredential(value: string, providerId: string) {
  try {
    return openCredential(value, providerId, rootKey());
  } catch {
    throw new AIError("credentials");
  }
}
