import { sameAnalysisSettings } from './athlete/references'
import type { EffortReference } from './effort'
import { readYear } from './history/balance'
import type { HistoryInput } from './history/types'
import { linesKey, setAsideAmong } from './periodKeys'
import { rideGateKey } from './digest/estimatedRide'
import { sameDigests } from './sameDigests'
import type { ThresholdEstimate } from './threshold'
import type { ActivityDigest, AthleteSettings, Sport } from './types'

/** What the reading takes besides the digests and masses. */
export type PreviousThresholdInput = Pick<HistoryInput, 'gate' | 'lines'> & {
  effortReference: EffortReference
  /** The heart rate set aside, and only that, as `combine` takes it. */
  setAside: ReadonlySet<string>
}

type Thresholds = Record<Sport, ThresholdEstimate | null>

/**
 * The thresholds of the period before, remembered while that period's digests, the masses and `key` (the ride gate, the effort
 * references, the heart rate set aside among them and the heart-rate lines) are the same. One is kept: a period switch asks for
 * the new one, and going back to the period just left is the case the periods' own analyses cover.
 */
export class PreviousThresholdMemo {
  private entry: {
    previous: ActivityDigest[]
    settings: AthleteSettings
    key: string
    value: Thresholds
  } | null = null

  get(
    previous: ActivityDigest[],
    settings: AthleteSettings,
    input: PreviousThresholdInput,
  ): Thresholds {
    const key = [
      rideGateKey(input.gate),
      JSON.stringify(input.effortReference),
      setAsideAmong(previous, [...input.setAside]),
      linesKey(input.lines, previous),
    ].join('||')
    const held = this.entry
    if (
      held !== null &&
      held.key === key &&
      sameAnalysisSettings(held.settings, settings) &&
      sameDigests(held.previous, previous)
    ) {
      return held.value
    }
    const value = readYear(previous, { ...input, settings }).threshold
    this.entry = { previous, settings, key, value }
    return value
  }

  /** Forgets the entry when a digest it was made from is gone from the library. */
  releaseAbsent(held: ReadonlySet<ActivityDigest>): void {
    if (this.entry !== null && !this.entry.previous.every((digest) => held.has(digest))) {
      this.entry = null
    }
  }
}
