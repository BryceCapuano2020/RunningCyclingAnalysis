import { MAX_KEPT_POWER } from '@rca/contract'
import type { AccountSettings } from '@rca/contract'
import { MAX_COUNTED_RUNS } from '@rca/core/athlete'
import { sameChoice } from '@rca/core/period'
import { getAccountSettings, putAccountSettings } from '../api/settings'
import { reportableZone } from './analysis/copyAge'
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

/** The account's list, then what this browser added that it lacks, cut to the most the account keeps. */
function union(account: readonly string[], browser: readonly string[], max: number): string[] {
  return [...new Set([...account, ...browser])].slice(0, max)
}

/**
 * What the account and this browser settle on at sign-in. The account wins for every field it holds, except that the
 * two lists (rides kept, runs counted) are joined once when this browser's copy was made before any sign-in
 * (`offer`) and the account already has its own: a second device's first sign-in adds to the account's choices and
 * never drops them. A field the account has never been given is filled from this browser once, on the same
 * condition; a copy that already mirrors the account is not offered back, so a choice cleared on another device
 * stays cleared. A field the athlete chose while the account was loading keeps that choice.
 */
export function settle(
  account: AccountSettings,
  browser: AccountSettings,
  offer: boolean,
  chosen: ReadonlySet<SettingsField>,
): AccountSettings {
  const pick = <V>(
    field: SettingsField,
    theirs: V | null,
    mine: V | null,
    join?: (a: V, b: V) => V,
  ) => {
    if (chosen.has(field)) return mine
    if (!offer) return theirs
    if (theirs === null) return mine
    return mine === null || join === undefined ? theirs : join(theirs, mine)
  }
  const list = (max: number) => (a: string[], b: string[]) => union(a, b, max)
  return {
    keepPower: pick('keepPower', account.keepPower, browser.keepPower, list(MAX_KEPT_POWER)),
    countedRuns: pick(
      'countedRuns',
      account.countedRuns,
      browser.countedRuns,
      list(MAX_COUNTED_RUNS),
    ),
    period: pick('period', account.period, browser.period),
  }
}

/**
 * Reads the account's settings and makes this browser's copy match them, after offering the browser's own
 * choices to an account that has none. Returns when both are done. A copy that mirrored another account is
 * dropped first and never offered. The copy is marked as this account's only once the account holds what was
 * offered, so a save that failed is offered again on the retry, not read as a copy that already mirrors it.
 * The zone goes along for every account, since the server computes each one's results: here when it is not the one this device last
 * reported (see `reportedZone`), so two devices in different zones do not take it from each other on every read. A save of the
 * choices always carries this browser's. Resolves whether it wrote to the account.
 */
export async function pullAccountSettings(
  userId: string,
  chosen: ReadonlySet<SettingsField>,
): Promise<boolean> {
  const account = await getAccountSettings(userId)
  const owner = readOwner()
  if (owner !== null && owner !== userId) {
    clearKeptPower()
    storeCountedRuns([])
    clearPeriodChoice()
  }
  const settled = settle(account, browserSettings(), owner === null, chosen)
  adopt(settled)
  // The server cuts the days of the results it computes in the athlete's zone. This device tells it when its zone is not the one it
  // last reported (a first read, or a move), so two devices in different zones each write once and do not flip it on every read.
  const zone = reportableZone()
  const moved = zone !== undefined && zone !== account.zone && zone !== reportedZone(userId)
  const write = !sameSettings(settled, account) || moved
  if (write) await putAccountSettings(withZone(settled, zone), userId)
  if (zone !== undefined && (write || zone === account.zone)) noteReportedZone(userId, zone)
  writeOwner(userId)
  return write
}

function withZone(settings: AccountSettings, zone: string | undefined): AccountSettings {
  return zone === undefined ? settings : { ...settings, zone }
}

/** Saves this browser's copy as the account's, with the zone this browser is in. */
export async function pushAccountSettings(userId: string): Promise<void> {
  const zone = reportableZone()
  await putAccountSettings(withZone(browserSettings(), zone), userId)
  if (zone !== undefined) noteReportedZone(userId, zone)
}

const zoneKey = (userId: string) => `rca-zone-reported:${userId}`

/** The zone this device last told the account it is in, or null. */
function reportedZone(userId: string): string | null {
  try {
    return localStorage.getItem(zoneKey(userId))
  } catch {
    return null
  }
}

function noteReportedZone(userId: string, zone: string): void {
  try {
    localStorage.setItem(zoneKey(userId), zone)
  } catch {
    // Not remembered: the zone is told again on the next read.
  }
}
