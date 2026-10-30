import { DAY_MS, HR_SET_ASIDE_MIN_S } from '../../constants'
import { combine } from '../../digest/combine'
import { digestActivity } from '../../digest/digestActivity'
import { sampleDataset } from '../../synthetic'
import type { ActivityDigest, AthleteSettings } from '../../types'

const { athlete, activities } = sampleDataset()
export const SET_ASIDE_SETTINGS: AthleteSettings = {
  massKg: athlete.massKg,
  bikeMassKg: athlete.bikeMassKg,
}

/**
 * A library in which the judgement of the heart rate depends on the bike model, so a period judged alone is
 * judged differently from the library.
 *
 * The sample's power-meter rides are a year old, so the recent six weeks hold none that is calibrated and
 * their analysis falls back to the default bike model, while the library's is fitted to the old rides. A
 * recent ride, `borderline`, has a best 10 min 85% of the library's and a sensor that read 60 bpm. Priced by
 * the default model it is held above threshold at that heart rate, so a period alone sets it aside. Priced by
 * the library's fitted model it is not, and another ride, `sample-09`, is set aside instead.
 */
export function setAsideLibrary(): { digests: ActivityDigest[]; newestMs: number } {
  const sample = activities.map((a) => digestActivity(a))
  const before = combine(sample, SET_ASIDE_SETTINGS)
  const source = sample.filter((d) => d.sport === 'ride' && d.powerSource === 'measured')[0]!
  const best10 = before.rideCurve.find((p) => p.durationS === HR_SET_ASIDE_MIN_S)!.value
  const newestMs = Math.max(...sample.map((d) => d.startMs)) + 1000
  const borderline: ActivityDigest = {
    ...source,
    id: 'borderline',
    startMs: newestMs,
    maxHeartRate: 250.25,
    calibration: null,
    climbSections: [],
    hrBlocks: source.hrBlocks.map(({ value, terms }) => ({ heartRate: 60, value, terms })),
    curve: source.curve.map(({ durationS, value, startIndex, windowS, terms }) => ({
      durationS,
      value: durationS === HR_SET_ASIDE_MIN_S ? best10 * 0.85 : value,
      startIndex: Math.max(0, startIndex),
      windowS,
      heartRate: 60,
      terms,
    })),
  }
  // The calibrated rides move to the year before, outside every recent period.
  const moved = sample.map((digest) =>
    digest.calibration === null
      ? digest
      : Object.assign({}, digest, { startMs: digest.startMs - 400 * DAY_MS }),
  )
  // A maximum counts once three separate days reached it, so the borderline ride's 250 bpm is matched by two more rides.
  const matching = moved.filter((digest) => digest.sport === 'ride')
  // They differ a little, since days that read the same whole number cannot corroborate each other.
  const raised = new Map(matching.slice(-2).map((digest, i) => [digest.id, 250.5 + i]))
  const library = moved.map((digest) =>
    raised.has(digest.id)
      ? Object.assign({}, digest, { maxHeartRate: raised.get(digest.id)! })
      : digest,
  )
  return { digests: [...library, borderline], newestMs }
}
