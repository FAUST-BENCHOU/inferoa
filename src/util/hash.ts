import { createHash, randomUUID } from "node:crypto";

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function shortHash(value: string, length = 16): string {
  return sha256Hex(value).slice(0, length);
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

export function hashJson(value: unknown): string {
  return sha256Hex(stableJson(value));
}

export function randomId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

export function base32UrlSha256(value: string, length: number): string {
  const bytes = createHash("sha256").update(value).digest();
  let bits = 0;
  let buffer = 0;
  let output = "";
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      const index = (buffer >> (bits - 5)) & 31;
      output += BASE32_ALPHABET[index];
      bits -= 5;
      if (output.length >= length) {
        return output;
      }
    }
  }
  if (bits > 0 && output.length < length) {
    output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  }
  return output.slice(0, length);
}
