import { vi } from 'vitest'
import { UTC_ZONE, type Zone } from '../calendar'
import type { SnapshotInput } from '../stateCompute'
import type { StateSnapshot } from '../stateSnapshot'
import type { ActivityDigest, AthleteSettings } from '../types'
import type { CorpusLibrary } from './snapshotCorpus'
import { fixedZone } from './zones'

/** One account of a server that shares an isolate: its zone, its settings and its period choice. */
export interface Account {
  name: string
  zone: Zone
  settings: AthleteSettings
  choice: SnapshotInput['choice']
}

/** Three accounts whose days, masses, references, kept power and periods all differ. `rideIds` are the rides the first keeps. */
export function accountsFor(rideIds: string[]): Account[] {
  return [
    {
      name: 'far east',
      zone: fixedZone(13),
      settings: {
        massKg: 58,
        bikeMassKg: 7,
        birthYear: 1988,
        sex: 'female',
        keepPower: rideIds,
        measurements: [{ kind: 'massKg', from: '2020-01-01', value: 57 }],
      },
      choice: 14,
    },
    {
      name: 'far west',
      zone: fixedZone(-11),
      settings: { massKg: 91, bikeMassKg: 11, birthYear: 1971, sex: 'male', countedRuns: [] },
      choice: 'all',
    },
    { name: 'utc, defaults', zone: UTC_ZONE, settings: { massKg: 70, bikeMassKg: 9 }, choice: 28 },
  ]
}

export function inputFor(
  library: { digests: ActivityDigest[]; nowMs: number },
  account: Account,
): SnapshotInput {
  return {
    digests: library.digests,
    settings: account.settings,
    choice: account.choice,
    libraryVersion: 3,
    nowMs: library.nowMs,
    zone: account.name,
    buildSha: 'test',
    viewerZone: account.zone,
  }
}

/** The account's snapshot from copies of every module no other account has touched. */
export async function solo(library: CorpusLibrary, account: Account): Promise<StateSnapshot> {
  vi.resetModules()
  const { computeSnapshot } = await import('../stateCompute')
  return computeSnapshot(inputFor(library, account))
}
