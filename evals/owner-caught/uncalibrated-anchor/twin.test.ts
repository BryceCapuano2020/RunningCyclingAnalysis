import { describe, expect, it } from 'vitest'
import { RUN_WORLD_RECORD_SPEEDS } from '@rca/core/constants'
import { CYCLING_ANCHOR_WKG } from '@rca/core/display'
import { gradeAtSpeed } from '@rca/core/grade'
import { equivalentRunSpeed } from '@rca/core/pipeline'

/*
 * Each sport's world-class hour, against the published figure the repository cites for it (case.md has the sources).
 * Cycling: Allen and Coggan's power profile table, the top of its FTP column, 6.40 W/kg for men and 5.69 for women, and
 * 6.60 for men in another reprint (docs/design/cross-sport.md). Running: the open men's world-record speeds in
 * RUN_WORLD_RECORD_SPEEDS, which hold the half marathon and the marathon either side of an hour.
 */
const MASS = 70
const HOUR_S = 3600
const OPEN_AGE = 25
const PUBLISHED_WKG = { male: 6.4, female: 5.69 } as const
/** The second reprint's men's value. The anchor states this disagreement as its own spread. */
const OTHER_REPRINT_MALE_WKG = 6.6
const SEXES = ['male', 'female'] as const

/** The world-record ceiling at an hour: the line between the half marathon's and the marathon's entries. */
function recordSpeedAtHour(): number {
  const below = RUN_WORLD_RECORD_SPEEDS.filter((entry) => entry.durationS <= HOUR_S).at(-1)!
  const above = RUN_WORLD_RECORD_SPEEDS.find((entry) => entry.durationS > HOUR_S)!
  const along = (HOUR_S - below.durationS) / (above.durationS - below.durationS)
  return below.speedMs + along * (above.speedMs - below.speedMs)
}

describe('the cycling anchor', () => {
  it.each(SEXES)('is the published hour for a %s', (sex) => {
    expect(CYCLING_ANCHOR_WKG[sex]).toBe(PUBLISHED_WKG[sex])
  })

  it.each(SEXES)(
    'grades a rider at the published hour as world class at an hour, for a %s',
    (sex) => {
      const speed = equivalentRunSpeed(PUBLISHED_WKG[sex] * MASS, MASS, sex).p50
      const grade = gradeAtSpeed(speed, HOUR_S, { age: OPEN_AGE, sex })!.grade
      expect(grade).toBeGreaterThan(0.995)
      expect(grade).toBeLessThan(1.005)
    },
  )

  it("holds the other reprint's men's hour inside the range the anchor states", () => {
    const published = equivalentRunSpeed(PUBLISHED_WKG.male * MASS, MASS, 'male')
    const other = equivalentRunSpeed(OTHER_REPRINT_MALE_WKG * MASS, MASS, 'male').p50
    expect(other).toBeGreaterThan(published.p05)
    expect(other).toBeLessThan(published.p95)
  })
})

describe('the running anchor', () => {
  it("puts the men's world-class hour within 0.5% of the world-record pace at an hour", () => {
    // The anchor is the speed a ride at the published cycling hour is worth: the running hour it is anchored to.
    const anchor = equivalentRunSpeed(PUBLISHED_WKG.male * MASS, MASS, 'male').p50
    const record = recordSpeedAtHour()
    expect(Math.abs(anchor / record - 1)).toBeLessThan(0.005)
  })
})
