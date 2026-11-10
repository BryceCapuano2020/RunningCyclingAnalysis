// No imports: storage.ts reads these, and this file must not read it back.

/** The key of a snapshot object: under the account's prefix, so the account sweep and the orphan scan cover it. */
export function stateKey(userId: string, hash: string): string {
  return `users/${userId}/state/${hash}.json.gz`
}

/** Matches a snapshot key: the account and the hash (the orphan scan reads both). */
export const STATE_KEY = /^users\/([^/]+)\/state\/([0-9a-f]{32})\.json\.gz$/

/** Whether a key is a snapshot's, for a sweep that must leave snapshots to the job that owns them. */
export function isStateKey(key: string): boolean {
  return STATE_KEY.test(key)
}
