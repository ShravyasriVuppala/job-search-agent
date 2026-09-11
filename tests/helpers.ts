// Flattens an error into a searchable string. A failed connection to `localhost` resolves both
// the IPv4 and IPv6 addresses, so a refused/timed-out connection throws a Node AggregateError
// whose own .message is "" — the real ECONNREFUSED/ETIMEDOUT text lives in err.errors[]. Tests
// that skip gracefully when there's no local Postgres available need to see into that array.
// (Checked via duck-typing, not `instanceof AggregateError` — this project's lib target is ES2020,
// which predates that global.)
function hasErrorsArray(err: unknown): err is { errors: unknown[] } {
  return typeof err === 'object' && err !== null && Array.isArray((err as { errors?: unknown }).errors);
}

export function errorMessage(err: unknown): string {
  if (hasErrorsArray(err)) {
    return err.errors.map((e) => (e instanceof Error ? e.message : String(e))).join('; ');
  }
  return err instanceof Error ? err.message : String(err);
}
