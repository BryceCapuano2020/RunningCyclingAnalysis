import '../test/warmSample'
import { describe, expect, it } from 'vitest'
import { localDayNumber, setViewerZone, withLocalWeeks } from '../calendar'
import { plantedLibrary } from '../findings/test/plantedLibrary'
import { AnalysisSession } from '../session'
import { fitnessStatuses } from './compute'

const NONE: ReadonlySet<string> = new Set()
const library = plantedLibrary({
  seed: 3,
  weeks: 100,
  perWeek: 3,
  noise: 0.03,
  noiseModel: { autocorrelation: 0.9, heavyTails: true },
  effects: [],
})
const withShift = (shift: -1 | 0 | 1) =>
  library.digests.map((d) => ({ ...d, localDayShift: shift }))

describe('the fitness monitor’s weeks', () => {
  it('are the UTC weeks while local weeks are off, whatever shift the digests carry', () => {
    const utc = fitnessStatuses(library.digests, NONE)
    expect(fitnessStatuses(withShift(1), NONE)).toEqual(utc)
  })

  it('give exactly the UTC figures with local weeks on when every shift is 0', () => {
    const utc = fitnessStatuses(library.digests, NONE)
    withLocalWeeks(true, () => {
      expect(fitnessStatuses(withShift(0), NONE)).toEqual(utc)
    })
  })

  it('read a library a day later in its own days, and say the same of the athlete', () => {
    const utc = fitnessStatuses(library.digests, NONE)
    withLocalWeeks(true, () => {
      const later = fitnessStatuses(withShift(1), NONE)
      expect(later.run.state).toBe(utc.run.state)
      expect(later.run.steady).toBe(utc.run.steady)
    })
  })

  it('use the viewer’s zone for a digest that recorded no shift', () => {
    const utc = fitnessStatuses(library.digests, NONE)
    const before = setViewerZone(() => 0)
    try {
      withLocalWeeks(true, () => {
        expect(fitnessStatuses(library.digests, NONE)).toEqual(utc)
      })
    } finally {
      setViewerZone(before)
    }
  })
})

describe('AnalysisSession.setZone', () => {
  it('gives the calendar the viewer’s zone', () => {
    const session = new AnalysisSession()
    const start = Date.UTC(2026, 2, 14, 20)
    const before = localDayNumber({ startMs: start })
    session.setZone(() => 9 * 60)
    try {
      expect(localDayNumber({ startMs: start })).toBe(before + 1)
    } finally {
      session.setZone(() => 0)
    }
  })
})
