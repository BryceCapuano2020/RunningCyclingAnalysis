import type { AccountSettings } from '@rca/contract'
import { sameChoice } from '@rca/core/period'
import { getAccountSettings, putAccountSettings } from '../api/settings'
import { browserZone } from './analysis/copyAge'
import { loadCountedRuns, storeCountedRuns } from './countedRunsStore'
import { clearKeptPower, keptPowerIds, replaceKeptPower } from './keptPowerStore'
import { clearPeriodChoice, replacePeriodChoice, storedPeriodChoice } from './periodPreference'
import type { SettingsField } from './settingsChosen'

/**
 * The account whose settings this browser's copy mirrors, kept from the first sign-in until sign-out. Without it
 * the choices made signed out would be offered to whichever account signs in next, a different person's included.
 * An account id is a random string that names no one outside this service.
 */
export const SETTINGS_OWNER_KEY = 'rca.settingsOwner.v1'

function readOwner(): string | null {
  try {
    return localStorage.getItem(SETTINGS_OWNER_KEY)
  } catch {
    return null
  }
}

function writeOwner(userId: string | null): void {
  try {
    if (userId === null) localStorage.removeItem(SETTINGS_OWNER_KEY)
    else localStorage.setItem(SETTINGS_OWNER_KEY, userId)
  } catch {
    // Without it the next sign-in offers this browser's choices to its account, which only matters on a shared one.
  }
}

/**
 * What signing out or deleting the account takes from this browser: the rides kept, the period, and the note of
 * whose they are. The runs counted go through their own controller. The account keeps its own copy of all of it.
 */
export function forgetAccountChoices(): void {
  clearKeptPower()
  clearPeriodChoice()
  writeOwner(null)
}

/** What this browser holds, as the account keeps it: a list or a pick that is empty is null, never set. */
export function browserSettings(): AccountSettings {
  const keepPower = keptPowerIds()
  const countedRuns = loadCountedRuns()
  const period = storedPeriodChoice()
  return {
    keepPower: keepPower.length === 0 ? null : [...keepPower],
    countedRuns: countedRuns.length === 0 ? null : countedRuns,
    period: period === 'default' ? null : period,
  }
}

/** Takes a document as this browser's copy. None of it is a choice, so none of it is sent back. */
function adopt(settings: AccountSettings): void {
  replaceKeptPower(settings.keepPower ?? [])
  storeCountedRuns(settings.countedRuns ?? [])
  if (settings.period === null) clearPeriodChoice()
  else replacePeriodChoice(settings.period)
}

function samePeriod(a: AccountSettings['period'], b: AccountSettings['period']): boolean {
  return a === null || b === null ? a === b : sameChoice(a, b)
}

function sameList(a: readonly string[] | null, b: readonly string[] | null): boolean {
  return a === null || b === null ? a === b : a.length === b.length && a.every((v, i) => v === b[i])
}

/** Whether two documents hold the same choices. */
export function sameSettings(a: AccountSettings, b: AccountSettings): boolean {
  return (
    sameList(a.keepPower, b.keepPower) &&
    sameList(a.countedRuns, b.countedRuns) &&
    samePeriod(a.period, b.period)
  )
}

/**
 * What the account and this browser settle on at sign-in. The account wins for every field it holds. A field
 * it has never been given is filled from this browser once, when the browser's copy was made before any
 * sign-in (`offer`); a copy that already mirrors the account is not offered back, so a choice cleared on
 * another device stays cleared. A field the athlete chose while the account was loading keeps that choice.
 */
export function settle(
  account: AccountSettings,
  browser: AccountSettings,
  offer: boolean,
  chosen: ReadonlySet<SettingsField>,
): AccountSettings {
  const pick = <K extends SettingsField>(field: K): AccountSettings[K] => {
    if (chosen.has(field)) return browser[field]
    if (account[field] !== null || !offer) return account[field]
    return browser[field]
  }
  return { keepPower: pick('keepPower'), countedRuns: pick('countedRuns'), period: pick('period') }
}

/**
 * Reads the account's settings and makes this browser's copy match them, after offering the browser's own
 * choices to an account that has none. Returns when both are done. A copy that mirrored another account is
 * dropped first and never offered.
 */
export async function pullAccountSettings(
  userId: string,
  chosen: ReadonlySet<SettingsField>,
): Promise<void> {
  const account = await getAccountSettings(userId)
  const owner = readOwner()
  if (owner !== null && owner !== userId) {
    clearKeptPower()
    storeCountedRuns([])
    clearPeriodChoice()
  }
  const settled = settle(account, browserSettings(), owner === null, chosen)
  adopt(settled)
  writeOwner(userId)
  // The server cuts the days of the results it computes in the athlete's zone, so it is told when it differs.
  const zone = browserZone()
  if (!sameSettings(settled, account) || account.zone !== zone) {
    await putAccountSettings({ ...settled, zone }, userId)
  }
}

/** Saves this browser's copy as the account's. */
export async function pushAccountSettings(userId: string): Promise<void> {
  await putAccountSettings({ ...browserSettings(), zone: browserZone() }, userId)
}
