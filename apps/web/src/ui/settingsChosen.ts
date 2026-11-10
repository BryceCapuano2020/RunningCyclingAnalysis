/** The choices the account keeps beside the browser's copy (accountSettings). */
export type SettingsField = 'keepPower' | 'countedRuns' | 'period'

const listeners = new Set<(field: SettingsField) => void>()

/**
 * Says the athlete made this choice, so a signed-in account saves it. Only a choice calls it: a sign-out
 * that clears the browser's copy, or an account's value written into it, does not, so neither can reach the
 * account.
 */
export function settingsChosen(field: SettingsField): void {
  for (const listener of listeners) listener(field)
}

/** Calls back on every choice. Returns the way to stop. */
export function onSettingsChosen(listener: (field: SettingsField) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
