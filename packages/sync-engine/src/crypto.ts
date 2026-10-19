import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// AES-256-GCM envelope for secrets at rest. The master key comes from
// UNWALLED_SECRET_KEY; a fixed dev key is used when unset so local
// scaffolding works out of the box. Set the env var for any real deployment.
const DEV_FALLBACK_SECRET = "unwalled-mail-dev-only-secret";
const KEY_SALT = "unwalled-mail:v1";

let warned = false;

function masterKey(): Buffer {
  const secret = process.env.UNWALLED_SECRET_KEY;
  if (!secret && !warned) {
    console.warn(
      "[unwalled] UNWALLED_SECRET_KEY not set — using the built-in development key. " +
        "Set it before storing real credentials.",
    );
    warned = true;
  }
  return scryptSync(secret ?? DEV_FALLBACK_SECRET, KEY_SALT, 32);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  // Rows written before encryption was enabled may hold plaintext — pass through.
  if (!stored.startsWith("v1:")) return stored;
  const [, iv, tag, data] = stored.split(":");
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString(
    "utf8",
  );
}

export function decryptIfPresent(value: string | null | undefined): string | undefined {
  return value ? decryptSecret(value) : undefined;
}
