export function abortError(message = "Operation interrupted"): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === "AbortError" || /aborted|abort|interrupt/i.test(error.message);
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }
  const reason = signal.reason;
  throw abortError(typeof reason === "string" && reason ? reason : "Operation interrupted");
}
