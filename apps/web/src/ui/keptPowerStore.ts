import { useSyncExternalStore } from 'react'
import { settingsChosen } from './settingsChosen'

/**
 * The rides whose implausible power the athlete chose to keep, by activity id. They are kept in this browser, and
 * signed in the account keeps them too (accountSettings): an id names no place or person.
 */
const KEY = 'rca.keepPower.v1'
/** Far more than any library holds implausible rides; a damaged value cannot grow without bound. */
const MAX_KEPT = 500

const NONE: readonly string[] = []
let current: readonly string[] | null = null
const listeners = new Set<() => void>()

/** The stored ids; anything that is not a list of strings reads as none. */
export function parseKeptPower(raw: string | null): readonly string[] {
  if (raw === null) return NONE
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return NONE
    const ids = [
      ...new Set((value as unknown[]).filter((id): id is string => typeof id === 'string')),
    ]
    return ids.length === 0 ? NONE : ids.sort().slice(0, MAX_KEPT)
  } catch {
    return NONE
  }
}

function load(): readonly string[] {
  try {
    return parseKeptPower(localStorage.getItem(KEY))
  } catch {
    return NONE
  }
}

function snapshot(): readonly string[] {
  current ??= load()
  return current
}

function store(ids: readonly string[]): void {
  writeKeptPower(ids)
  settingsChosen('keepPower')
}

/** The rides kept now. */
export function keptPowerIds(): readonly string[] {
  return snapshot()
}

/**
 * Takes the account's list as this browser's: stored and shown, but not a choice, so it is not sent back. An
 * empty list removes the key.
 */
export function replaceKeptPower(ids: readonly string[]): void {
  if (ids.length === 0) clearKeptPower()
  else writeKeptPower([...new Set(ids)].sort().slice(0, MAX_KEPT))
}

function writeKeptPower(ids: readonly string[]): void {
  current = ids
  try {
    localStorage.setItem(KEY, JSON.stringify(ids))
  } catch {
    // The choice holds for this visit; the page cannot keep it past a reload.
  }
  for (const listener of listeners) listener()
}

/** Forgets every kept ride: a sign-out, a deleted account or Remove all takes the choices with it. */
export function clearKeptPower(): void {
  current = NONE
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing was kept that could be removed.
  }
  for (const listener of listeners) listener()
}

/**
 * Drops the list held in memory so the next read takes it from storage again. The test setup calls it around every
 * test: the store outlives a rendered hook, so one test's kept rides would otherwise be the next test's.
 */
export function resetKeptPowerCache(): void {
  current = null
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    // A null key is the whole storage cleared, which takes this list with it.
    if (event.key !== KEY && event.key !== null) return
    current = load()
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export interface KeptPower {
  /** The same array until a choice changes, so an analysis is not redone for a render. */
  ids: readonly string[]
  keep: (id: string) => void
  release: (id: string) => void
}

/** Rides kept despite implausible power, and the two ways to change that. */
export function useKeptPower(): KeptPower {
  const ids = useSyncExternalStore(subscribe, snapshot, () => NONE)
  return {
    ids,
    keep: (id) => {
      if (!snapshot().includes(id)) store([...snapshot(), id].sort().slice(0, MAX_KEPT))
    },
    release: (id) => {
      if (snapshot().includes(id)) store(snapshot().filter((kept) => kept !== id))
    },
  }
}
