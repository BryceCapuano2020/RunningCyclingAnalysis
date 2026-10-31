import '../test/warmSample'
import { describe, expect, it } from 'vitest'
import { localDayNumber, setViewerZone, WEEK_MS, WEEK_ORIGIN_MS } from '../calendar'
import { plantedLibrary } from '../findings/test/plantedLibrary'
import { AnalysisSession } from '../session'
import { fitnessStatuses, runPointsOf } from './compute'
import { localWeekOf, weekOfMs } from './machine'

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
  it('give exactly the UTC figures when every shift is 0', () => {
    const utc = fitnessStatuses(library.digests, NONE)
    {
      expect(fitnessStatuses(withShift(0), NONE)).toEqual(utc)
    }
  })

  it('read a library a day later in its own days, and say the same of the athlete', () => {
    const utc = fitnessStatuses(library.digests, NONE)
    {
      const later = fitnessStatuses(withShift(1), NONE)
      expect(later.run.state).toBe(utc.run.state)
      expect(later.run.steady).toBe(utc.run.steady)
    }
  })

  it('use the viewer’s zone for a digest that recorded no shift', () => {
    const utc = fitnessStatuses(library.digests, NONE)
    const before = setViewerZone(() => 0)
    try {
      {
        expect(fitnessStatuses(library.digests, NONE)).toEqual(utc)
      }
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

describe('the runs on the clock of days', () => {
  const at = (hours: number) => WEEK_ORIGIN_MS + 14 * 86_400_000 + hours * 3_600_000
  // A is Sunday 23:30 UTC in a zone that has already reached Monday; B is Monday 00:30 UTC in one still on Sunday.
  const a = { id: 'a', startMs: at(-0.5), x: 0, localDayShift: 1 as const }
  const b = { id: 'b', startMs: at(0.5), x: 0, localDayShift: -1 as const }

  it('are in order of their local day, whatever the order of start, and keep their own start', () => {
    {
      const runs = runPointsOf([a, b])
      expect(runs.map((r) => r.id)).toEqual(['b', 'a'])
      expect(runs.map((r) => r.startMs)).toEqual([b.startMs, a.startMs])
      expect(runs[0]!.t).toBeLessThan(runs[1]!.t)
    }
  })

  it('give the week an instant is in, in the viewer’s zone', () => {
    const sundayEnd = WEEK_ORIGIN_MS + 14 * 86_400_000 - 1
    const before = setViewerZone(() => -7 * 60)
    try {
      {
        // Monday 06:59 UTC is still Sunday evening at UTC-7; 07:00 is Monday.
        expect(localWeekOf(sundayEnd + 6 * 3_600_000 + 59 * 60_000)).toBe(weekOfMs(sundayEnd))
        expect(localWeekOf(sundayEnd + 7 * 3_600_000 + 1)).toBe(weekOfMs(sundayEnd) + 1)
      }
    } finally {
      setViewerZone(before)
    }
    expect(WEEK_MS).toBe(7 * 86_400_000)
  })

  it('are told by their own start, not the day they were put on', () => {
    const starts = new Set(library.digests.map((d) => d.startMs))
    {
      const status = fitnessStatuses(withShift(1), NONE).run
      expect(status.evidence?.recent.runs).toBeGreaterThan(0)
      expect(starts.has(status.evidence!.recent.toMs)).toBe(true)
      expect(starts.has(status.evidence!.recent.fromMs)).toBe(true)
    }
  })
})
