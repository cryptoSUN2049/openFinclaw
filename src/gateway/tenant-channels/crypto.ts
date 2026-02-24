import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

/**
 * Encrypt a plaintext string (e.g. bot token) using AES-256-GCM.
 * Returns hex-encoded ciphertext (with appended auth tag) and IV.
 */
export function encryptToken(plaintext: string, keyHex: string): { encrypted: string; iv: string } {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("Encryption key must be 32 bytes (64 hex chars)");
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Store encrypted + authTag together for simplicity
  const combined = Buffer.concat([encrypted, authTag]);
  return {
    encrypted: combined.toString("hex"),
    iv: iv.toString("hex"),
  };
}

/**
 * Decrypt a hex-encoded ciphertext back to the original plaintext.
 */
export function decryptToken(encryptedHex: string, ivHex: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("Encryption key must be 32 bytes (64 hex chars)");
  }
  const combined = Buffer.from(encryptedHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = combined.subarray(combined.length - AUTH_TAG_BYTES);
  const encrypted = combined.subarray(0, combined.length - AUTH_TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}
