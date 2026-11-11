import type { SettingsField } from './settingsChosen'

/** The choices this browser made that the account does not hold yet, with the account they are for. Shared by every tab. */
const KEY = 'rca.settingsUnsent.v1'

const FIELDS: readonly SettingsField[] = ['keepPower', 'countedRuns', 'period']

function read(userId: string): Set<SettingsField> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (typeof parsed !== 'object' || parsed === null) return new Set()
    const { userId: owner, fields } = parsed as { userId?: unknown; fields?: unknown }
    if (owner !== userId || !Array.isArray(fields)) return new Set()
    return new Set(FIELDS.filter((field) => fields.includes(field)))
  } catch {
    return new Set()
  }
}

function write(userId: string, fields: ReadonlySet<SettingsField>): void {
  try {
    if (fields.size === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify({ userId, fields: [...fields] }))
  } catch {
    // Without storage a tab holds only its own unsent choices, as before.
  }
}

/** The choices not in the account yet, as every tab of this browser made them. */
export function unsentFields(userId: string): Set<SettingsField> {
  return read(userId)
}

/** Notes a choice as not in the account yet. */
export function addUnsent(userId: string, field: SettingsField): void {
  write(userId, new Set([...read(userId), field]))
}

/** The account holds these now: the choices a save carried, and no other. */
export function clearUnsent(userId: string, fields: ReadonlySet<SettingsField>): void {
  write(userId, new Set([...read(userId)].filter((field) => !fields.has(field))))
}

/** Forgets every unsent choice: signing out or deleting the account takes the choices themselves. */
export function forgetUnsent(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing was kept.
  }
}
