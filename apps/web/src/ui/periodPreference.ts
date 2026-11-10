import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { isCustomChoice, orderedRange } from '@rca/core/customRange'
import type { PeriodChoice } from '@rca/core/period'
import type { LoadPeriod } from '../worker/protocol'
import { RANGE_OPTIONS } from './components/rangeOptions'
import { settingsChosen } from './settingsChosen'
/** Where the period picked on this device is kept. Exported so the tests read the same key. */
export const PERIOD_KEY = 'rca.period.v1'

/**
 * The period the athlete last picked on this device. Nothing stored, or a value that is not one of
 * the periods the control offers, is the default: the athlete has picked none.
 */
export function parsePeriodChoice(raw: string | null): PeriodChoice {
  if (raw === null) return 'default'
  try {
    const value: unknown = JSON.parse(raw)
    if (isCustomChoice(value)) return orderedRange(value)
    return RANGE_OPTIONS.find((option) => option.choice === value)?.choice ?? 'default'
  } catch {
    return 'default'
  }
}

/** What this visit holds when the browser would not store it. */
let unstored: PeriodChoice | null = null

/** The period stored on this device: the default when none is stored or storage cannot be read. */
export function storedPeriodChoice(): PeriodChoice {
  if (unstored !== null) return unstored
  try {
    return parsePeriodChoice(localStorage.getItem(PERIOD_KEY))
  } catch {
    return 'default'
  }
}

/**
 * What a library or sample load says of the period: the one stored on this device, or nothing for
 * the default, which a new session already has.
 */
export function storedPeriodRequest(): LoadPeriod {
  const choice = storedPeriodChoice()
  return choice === 'default' ? {} : { choice }
}

const listeners = new Set<() => void>()
function writePeriod(next: PeriodChoice): void {
  unstored = next
  try {
    if (next === 'default') localStorage.removeItem(PERIOD_KEY)
    else localStorage.setItem(PERIOD_KEY, JSON.stringify(next))
    unstored = null
  } catch {
    // Storage can be unavailable (private windows); the choice still applies for this visit.
  }
  for (const listener of listeners) listener()
}

/**
 * Takes the account's period as this browser's: stored and shown, but not a choice, so it is not sent back.
 * The default removes the key.
 */
export function replacePeriodChoice(next: PeriodChoice): void {
  writePeriod(next)
}

/** Forgets the period kept here, as signing out does. */
export function clearPeriodChoice(): void {
  writePeriod('default')
}

// A string, so a render reads the same value until the choice changes; the choice is parsed from it.
function readRaw(): string {
  return JSON.stringify(storedPeriodChoice())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === PERIOD_KEY || event.key === null) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** The period on screen, kept in this browser once the athlete picks one, and in the account when signed in. */
export function usePeriodChoice(): [PeriodChoice, (choice: PeriodChoice) => void] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => JSON.stringify('default'))
  const update = useCallback((next: PeriodChoice) => {
    writePeriod(next)
    settingsChosen('period')
  }, [])
  const choice = useMemo(() => parsePeriodChoice(raw), [raw])
  return [choice, update]
}
