export function nowIso(): string {
  return new Date().toISOString();
}

export function epochMillis(): number {
  return Date.now();
}
