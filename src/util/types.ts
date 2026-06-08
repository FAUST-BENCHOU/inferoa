import type { JsonObject } from "../types.js";

/**
 * Extract a non-empty string field from an unknown value, or return undefined.
 */
export function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Extract a JsonObject from an unknown value, or return an empty object.
 */
export function objectField(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

/**
 * Extract a number from an unknown value with a fallback default.
 */
export function numberOrDefault(value: unknown, fallback: number): number {
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

/**
 * Return a promise that resolves after the given number of milliseconds.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper to cast a structured object to JsonObject for event/result data.
 * Use this instead of `as unknown as JsonObject` casts.
 */
export function toJson<T extends Record<string, unknown>>(value: T): JsonObject {
  return value as unknown as JsonObject;
}
