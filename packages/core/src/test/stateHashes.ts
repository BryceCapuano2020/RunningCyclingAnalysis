import type { PeriodChoice } from '../period'
import { AnalysisSession } from '../session'
import type { SessionState } from '../session'
import { sha256Hex } from '../sha256'
import type { ActivityDigest, AthleteSettings } from '../types'

/** Enough of the hash to tell any change of a field. */
const HASH_CHARS = 16

/**
 * JSON in which equal text means equal values. Plain JSON writes NaN and the infinities as null, -0 as
 * 0, and leaves out a key set to undefined. Every string is tagged too, so no string can pass for one
 * of those, and a Map is written as its entries.
 */
function exactJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (entry === undefined) return 'undefined'
    if (typeof entry === 'string') return `string:${entry}`
    if (entry instanceof Map) return { map: [...entry] }
    if (typeof entry !== 'number') return entry
    if (Object.is(entry, -0)) return 'number:-0'
    return Number.isFinite(entry) ? entry : `number:${entry}`
  })
}

const FIELDS = [
  'result',
  'trend',
  'effortTrends',
  'sameHeartRate',
  'lateEvidence',
  'heartRateJudgement',
  'fitness',
  'zoneEstimates',
  'timeInZones',
  'previous',
  'records',
  'library',
  'period',
] as const satisfies readonly (keyof SessionState)[]

/**
 * The first characters of the SHA-256 of each field of the state a session gives for a library under
 * each period choice, by `<choice>/<field>`, for the settings given. A change that only makes the analysis faster leaves every
 * one as it is; one that means to change it says which field moved.
 */
export async function stateHashes(
  library: ActivityDigest[],
  choices: readonly PeriodChoice[],
  settings: AthleteSettings,
): Promise<Record<string, string>> {
  const encoder = new TextEncoder()
  const hashes: Record<string, string> = {}
  for (const choice of choices) {
    const session = new AnalysisSession()
    // The fitness status reads the clock; the library's own last day keeps the pins from drifting with the date.
    session.clock = () => Math.max(...library.map((digest) => digest.startMs))
    session.choosePeriod(choice)
    const state = session.loadDigests(library, settings)
    for (const field of FIELDS) {
      const hash = await sha256Hex(encoder.encode(exactJson(state[field])))
      hashes[`${JSON.stringify(choice)}/${field}`] = hash.slice(0, HASH_CHARS)
    }
  }
  return hashes
}
