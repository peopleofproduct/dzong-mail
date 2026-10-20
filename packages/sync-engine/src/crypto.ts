import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "./attachments";

// AES-256-GCM envelope for secrets at rest. The master key comes from
// DZONG_SECRET_KEY; when unset, a random key is generated once and
// persisted under the data dir (mode 0600) so credentials are never
// encrypted with a shared, public default.
// The salt must never change — it derives the key that decrypts every
// stored secret. It keeps the pre-rename value on purpose.
const KEY_SALT = "unwalled-mail:v1";

let cachedKey: Buffer | null = null;
let warned = false;

function keyFilePath(): string {
  return path.join(dataDir(), "secret.key");
}

/**
 * Resolve the master secret: DZONG_SECRET_KEY first (explicit ops
 * control, shareable across machines), otherwise a machine-local key
 * generated on first use and stored next to the attachment store.
 */
function resolveSecret(): string {
  const env = process.env.DZONG_SECRET_KEY ?? process.env.UNWALLED_SECRET_KEY;
  if (env) return env;

  const keyPath = keyFilePath();
  try {
    const existing = readFileSync(keyPath, "utf8").trim();
    if (existing) return existing;
  } catch {
    /* first run - generate below */
  }

  const generated = randomBytes(32).toString("base64url");
  try {
    mkdirSync(path.dirname(keyPath), { recursive: true });
    writeFileSync(keyPath, generated, { mode: 0o600 });
  } catch (err) {
    console.error("[dzong] could not persist generated secret key:", err);
  }
  if (!warned) {
    console.warn(
      `[dzong] DZONG_SECRET_KEY not set — generated a machine key at ${keyPath}. ` +
        "Set the env var to keep the same key across machines.",
    );
    warned = true;
  }
  return generated;
}

function masterKey(): Buffer {
  cachedKey ??= scryptSync(resolveSecret(), KEY_SALT, 32);
  return cachedKey;
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
