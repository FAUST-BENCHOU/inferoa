import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureDir, homeStateDir } from "../util/fs.js";

interface VaultEntry {
  iv: string;
  tag: string;
  value: string;
}

type VaultPayload = Record<string, VaultEntry>;

export function secretRef(scope: string, key = "api-key"): string {
  return `secret-${slug(scope)}-${slug(key)}`;
}

export function readSecret(ref?: string): string | undefined {
  if (!ref) {
    return undefined;
  }
  const entry = readVaultSync()[ref];
  if (!entry) {
    return undefined;
  }
  try {
    const key = readVaultKeySync();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(entry.iv, "base64"));
    decipher.setAuthTag(Buffer.from(entry.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(entry.value, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return undefined;
  }
}

export async function writeSecret(ref: string, value: string): Promise<string> {
  const text = value.trim();
  if (!text) {
    throw new Error("secret value is empty");
  }
  await ensureDir(vaultDir());
  const key = await ensureVaultKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const payload = readVaultSync();
  payload[ref] = {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    value: encrypted.toString("base64"),
  };
  const target = vaultPath();
  await fs.writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await chmodBestEffort(target, 0o600);
  return target;
}

function vaultDir(): string {
  return process.env.INFEROA_STATE_DIR || homeStateDir();
}

function vaultPath(): string {
  return path.join(vaultDir(), "secrets.json");
}

function keyPath(): string {
  return path.join(vaultDir(), "secrets.key");
}

function readVaultSync(): VaultPayload {
  const target = vaultPath();
  if (!existsSync(target)) {
    return {};
  }
  const parsed = JSON.parse(readFileSync(target, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  return parsed as VaultPayload;
}

async function ensureVaultKey(): Promise<Buffer> {
  const target = keyPath();
  if (existsSync(target)) {
    return readVaultKeySync();
  }
  await ensureDir(path.dirname(target));
  const key = randomBytes(32);
  await fs.writeFile(target, `${key.toString("base64")}\n`, "utf8");
  await chmodBestEffort(target, 0o600);
  return key;
}

function readVaultKeySync(): Buffer {
  const text = readFileSync(keyPath(), "utf8").trim();
  const key = Buffer.from(text, "base64");
  if (key.length !== 32) {
    throw new Error("invalid local vault key");
  }
  return key;
}

async function chmodBestEffort(target: string, mode: number): Promise<void> {
  try {
    await fs.chmod(target, mode);
  } catch {
    // Windows and some mounted filesystems may reject chmod.
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "default";
}

try {
  if (existsSync(vaultPath())) {
    chmodSync(vaultPath(), 0o600);
  }
} catch {
  // Best-effort hardening for existing vaults.
}
