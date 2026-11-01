/** Where this browser keeps the preferences (see useSettings). */
export const PREFERENCES_KEY = 'rca.preferences.v1'

/**
 * Forgets the preferences kept in this browser, so the next visitor starts from the defaults. The tab that is open
 * is told as another tab is (the browser's storage event, which it does not send to the tab that made the change).
 */
export function forgetPreferences(): void {
  try {
    localStorage.removeItem(PREFERENCES_KEY)
  } catch {
    // Nothing was kept that could be removed.
  }
  window.dispatchEvent(new StorageEvent('storage', { key: PREFERENCES_KEY }))
}
