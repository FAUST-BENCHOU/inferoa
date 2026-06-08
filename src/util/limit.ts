import type { JsonObject, ToolResult } from "../types.js";

export const DEFAULT_TEXT_LIMIT = 24_000;
export const DEFAULT_LIST_LIMIT = 200;

export function clampLimit(value: unknown, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.min(Math.trunc(value), max));
}

export function truncateText(text: string, limit = DEFAULT_TEXT_LIMIT): { text: string; truncated: boolean } {
  if (text.length <= limit) {
    return { text, truncated: false };
  }
  return {
    text: `${text.slice(0, limit)}\n[truncated ${text.length - limit} chars]`,
    truncated: true,
  };
}

export function ok(summary: string, data?: JsonObject): ToolResult {
  return data === undefined ? { ok: true, summary } : { ok: true, summary, data };
}

export function fail(code: string, message: string, data?: JsonObject): ToolResult {
  return data === undefined
    ? { ok: false, summary: message, error: { code, message } }
    : { ok: false, summary: message, data, error: { code, message } };
}

export function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
