import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { getServerEnv } from "@/lib/env";

const ALGORITHM = "aes-256-gcm" as const;

function key() {
  const value = getServerEnv().INTEGRATION_ENCRYPTION_KEY;
  if (!value) throw new Error("Google integrations are not configured.");
  return Buffer.from(value, "hex");
}

function encode(value: Buffer) {
  return value.toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url");
}

/** Encrypt short-lived OAuth state and long-lived refresh tokens. */
export function encryptSecret(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(encode).join(".");
}

export function decryptSecret(value: string) {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("Encrypted value is malformed.");

  const decipher = createDecipheriv(ALGORITHM, key(), decode(ivRaw));
  decipher.setAuthTag(decode(tagRaw));
  return Buffer.concat([decipher.update(decode(encryptedRaw)), decipher.final()]).toString("utf8");
}

/** HMAC-like stable binding useful for logs and diagnostics without exposing a secret. */
export function secretFingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
