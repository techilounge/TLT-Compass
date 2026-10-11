import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export function sealCredential(
  raw: string,
  providerId: string,
  key: Uint8Array,
) {
  if (key.length !== 32) throw new Error("Invalid encryption key");
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(providerId));
  const bytes = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  return [
    "v1",
    nonce.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    bytes.toString("base64url"),
  ].join(".");
}
export function openCredential(
  value: string,
  providerId: string,
  key: Uint8Array,
) {
  const [version, nonce, tag, bytes, ...extra] = value.split(".");
  if (version !== "v1" || extra.length || key.length !== 32)
    throw new Error("Invalid encrypted credential");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(nonce, "base64url"),
  );
  decipher.setAAD(Buffer.from(providerId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(bytes, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
