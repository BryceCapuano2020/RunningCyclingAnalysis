import { digestActivity } from '../digest/digestActivity'
import { seasonDigests } from '../sessionSample'
import { DEFAULT_ATHLETE, SAMPLE_CLOCK, sampleDataset } from '../synthetic'
import type { ActivityDigest, AthleteSettings } from '../types'
import { setAsideLibrary } from '../zones/test/setAsideLibrary'
import { copiedLibrary } from './libraryFixture'

export interface CorpusLibrary {
  name: string
  digests: ActivityDigest[]
  settings: AthleteSettings
  /** An instant just after the newest activity. */
  nowMs: number
}

const SETTINGS: AthleteSettings = {
  massKg: DEFAULT_ATHLETE.massKg,
  bikeMassKg: DEFAULT_ATHLETE.bikeMassKg,
}

const after = (digests: ActivityDigest[]) => Math.max(...digests.map((d) => d.startMs)) + 7_200_000

/**
 * The synthetic libraries a snapshot must carry whole, each a different shape of state: the default athlete's eight weeks, the
 * sample athlete's season, a long hard-effort library (every gate open) and one where heart rate is set aside.
 */
export function snapshotCorpus(): CorpusLibrary[] {
  const dataset = sampleDataset().activities.map((a) => digestActivity(a))
  const season = seasonDigests(SAMPLE_CLOCK)
  const hard = copiedLibrary(120, { hard: true })
  const setAside = setAsideLibrary().digests
  return [
    { name: 'eight weeks', digests: dataset, settings: SETTINGS, nowMs: after(dataset) },
    { name: 'sample season', digests: season, settings: SETTINGS, nowMs: SAMPLE_CLOCK.nowMs },
    { name: 'hard library', digests: hard, settings: SETTINGS, nowMs: after(hard) },
    { name: 'heart rate set aside', digests: setAside, settings: SETTINGS, nowMs: after(setAside) },
  ]
}
