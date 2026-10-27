/**
 * What a failure says: an Error's message. Anything else is written out, or replaced by `fallback`
 * when the caller has words of its own for it.
 */
export function messageOf(failure: unknown, fallback?: string): string {
  if (failure instanceof Error) return failure.message
  return fallback ?? String(failure)
}
