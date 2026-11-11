// No imports: storage.ts reads these, and this file must not read it back.

/**
 * The key of a file a provider pushed, waiting to be read: under the account's prefix, so the account sweep and the
 * orphan scan cover it (docs/design/garmin-sync.md decision 4). The item id is the inbox row's.
 */
export function inboxKey(userId: string, itemId: string): string {
  return `users/${userId}/inbox/${itemId}`
}

/** Matches an inbox key: the account and the item (the orphan scan reads both). */
export const INBOX_KEY = /^users\/([^/]+)\/inbox\/([^/]+)$/

/** Whether a key is an inbox file's, for a sweep that must leave the inbox to the ingest that owns it. */
export function isInboxKey(key: string): boolean {
  return INBOX_KEY.test(key)
}
