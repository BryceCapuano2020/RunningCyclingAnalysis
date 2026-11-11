const KEY = 'rca-stale-build-reload'
/** A second reload within this long is not made: a tab that is still old after one reload would otherwise loop. */
export const RELOAD_GUARD_MS = 10 * 60_000

/**
 * The server answered in the shape of another build, so this tab is the old one (the Worker serves its own build). Reloads
 * the page once, then keeps the copy it has. Says whether it reloaded. The guard is per tab (`sessionStorage`); where
 * storage refuses, no reload is made, since the guard could not hold.
 */
export function reloadOnceForNewBuild(
  nowMs: number = Date.now(),
  reload: () => void = () => location.reload(),
): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY))
    if (last > 0 && nowMs - last < RELOAD_GUARD_MS) return false
    sessionStorage.setItem(KEY, String(nowMs))
  } catch {
    return false
  }
  reload()
  return true
}
