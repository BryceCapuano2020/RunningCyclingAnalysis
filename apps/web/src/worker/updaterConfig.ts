/**
 * Whether the updater starts by itself after a library load. Off: a rebuild replaces a digest and keeps no
 * copy of the old one, so it cannot be undone, and it runs only when the athlete presses Update now. The
 * switch is turned on in its own change, after the owner has rebuilt a library by hand and checked it.
 */
export const AUTO_UPDATE_ENABLED = false

/** Consecutive failures (not limits) after which the updater stops, so a bad rewrite damages few rows. */
export const BREAKER_FAILURES = 5

/** Activities rebuilt at once: each lane takes the next candidate when it finishes one. */
export const UPDATE_PARALLELISM = 2

/** The longest one attempt (download and read, or save) may take before it counts as a failure. */
export const STEP_TIMEOUT_MS = 20_000

/** The Web Lock the one tab that writes for an account holds. The outbox flusher takes the same name. */
export const WRITER_LOCK_PREFIX = 'rca-flush-'

/**
 * Why an update ended before every candidate was tried, besides a limit (which `limitKind` says).
 * - `breaker`: too many failures in a row.
 * - `outdated`: the server says this app is too old to write; reload the page.
 * - `newer`: the server holds a copy from a newer version of the app.
 * - `refused`: the server refused a rebuilt digest as from a model newer than it supports.
 * - `paused`: a request that changes the library was waiting, so the update stood aside.
 * - `elsewhere`: another tab of this account holds the writer lock.
 * - `discarded`: the library the update ran for was replaced or cleared meanwhile.
 */
export type UpdateStop =
  'breaker' | 'outdated' | 'newer' | 'refused' | 'paused' | 'elsewhere' | 'discarded'
