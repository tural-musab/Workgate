import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { getAppEnv } from "./env";

function deriveKey() {
  return createHash("sha256").update(getAppEnv().authSecret).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${authTag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string) {
  const [ivPart, authTagPart, encryptedPart] = payload.split(".");
  if (!ivPart || !authTagPart || !encryptedPart) {
    throw new Error("Invalid encrypted payload.");
  }
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(), Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(Buffer.from(authTagPart, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedPart, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}

export function maskSecret(value: string | null) {
  if (!value) return null;
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

