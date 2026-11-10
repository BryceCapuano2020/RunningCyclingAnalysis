import { describe, expect, it } from 'vitest'
import { calendarKey, localDateText, setViewerZone, UTC_ZONE, withViewerZone } from './calendar'
import { digestActivity } from './digest/digestActivity'
import { AnalysisSession } from './session'
import { sampleDataset } from './synthetic'
import { fixedZone } from './test/zones'

const { athlete, activities } = sampleDataset()
const SETTINGS = { massKg: athlete.massKg, bikeMassKg: athlete.bikeMassKg }
const digests = activities.map((a) => digestActivity(a))
const NOW = Math.max(...digests.map((d) => d.startMs)) + 3_600_000

function sessionIn(zone: ReturnType<typeof fixedZone>, nowMs = NOW) {
  const session = new AnalysisSession(undefined, zone)
  session.clock = () => nowMs
  return session
}

/** The same call on a session of its own, with nothing else going on in the process. */
const alone = (zone: ReturnType<typeof fixedZone>, nowMs?: number) =>
  sessionIn(zone, nowMs).loadDigests(digests, SETTINGS)

describe('the viewer zone as a parameter', () => {
  it('gives two sessions in one process the figures each would have alone, in either order', () => {
    const west = fixedZone(-11)
    const east = fixedZone(13)
    const westAlone = alone(west)
    const eastAlone = alone(east)
    // Interleaved, on live sessions: one's zone must not reach the other's cache or its days.
    const a = sessionIn(west)
    const b = sessionIn(east)
    const westFirst = a.loadDigests(digests, SETTINGS)
    const eastNext = b.loadDigests(digests, SETTINGS)
    const westAgain = a.setSettings({ ...SETTINGS, massKg: SETTINGS.massKg + 1 })
    const eastAgain = b.setSettings(SETTINGS)
    expect(westFirst).toEqual(westAlone)
    expect(eastNext).toEqual(eastAlone)
    expect(eastAgain).toEqual(eastAlone)
    expect(westAgain.result?.activities.length).toBe(westAlone.result?.activities.length)
    // The zones are 24 hours apart, so a library cut in each holds different days: the comparison has something to say.
    expect(westAlone).not.toEqual(eastAlone)
  })

  it('leaves the module zone as it was, which a session given a zone never reads or sets', () => {
    const before = setViewerZone(UTC_ZONE)
    try {
      const key = calendarKey()
      sessionIn(fixedZone(9)).loadDigests(digests, SETTINGS)
      expect(calendarKey()).toBe(key)
      expect(localDateText(NOW)).toBe(new Date(NOW).toISOString().slice(0, 10))
    } finally {
      setViewerZone(before)
    }
  })

  it('puts the zone back when the run throws, and keeps the key of a zone it returns to', () => {
    const before = setViewerZone(UTC_ZONE)
    try {
      const key = calendarKey()
      expect(() =>
        withViewerZone(fixedZone(5), () => {
          expect(calendarKey()).not.toBe(key)
          throw new Error('stop')
        }),
      ).toThrow('stop')
      expect(calendarKey()).toBe(key)
      expect(withViewerZone(UTC_ZONE, () => calendarKey())).toBe(key)
    } finally {
      setViewerZone(before)
    }
  })
})

describe('withViewerZone takes synchronous work only', () => {
  it('refuses work that returns a promise, and puts the zone back', () => {
    const key = calendarKey()
    const day = localDateText(Date.UTC(2031, 0, 1, 23))
    expect(() => withViewerZone(fixedZone(5), async () => 1)).toThrow(/synchronous work only/)
    expect(calendarKey()).toBe(key)
    expect(localDateText(Date.UTC(2031, 0, 1, 23))).toBe(day)
  })
})
