import { describe, expect, it } from 'vitest'
import type { RacePrediction } from '@rca/core/predict'
import { raceBar, raceScale } from './raceBars'

/** A 5 km predicted at 20:00, spread 19:00 to 21:30, estimated 19:30 from runs and 20:30 from heart rate. */
const FIVE_K: RacePrediction = {
  distanceM: 5000,
  seconds: 1200,
  low: 1140,
  high: 1290,
  methods: [
    { method: 'performances', seconds: 1170, fromM: 10_000 },
    { method: 'heartRate', seconds: 1230, fromM: 5000 },
  ],
}

/** A bar on a scale of its own race alone. */
const alone = (prediction: RacePrediction, ran: number | null = null) =>
  raceBar(
    prediction,
    raceScale([prediction], ran === null ? undefined : new Map([[prediction.distanceM, ran]])),
    ran,
  )

describe('raceBar', () => {
  it('places every part linearly in seconds, quickest at the left', () => {
    const bar = alone(FIVE_K)
    expect(bar.low).toBeLessThan(bar.methods[0]!.at)
    expect(bar.methods[0]!.at).toBeLessThan(bar.prediction)
    expect(bar.prediction).toBeLessThan(bar.methods[1]!.at)
    expect(bar.methods[1]!.at).toBeLessThan(bar.high)
    // 1200 is 60 of the 150 s between the ends: 40% of the way along the spread.
    expect((bar.prediction - bar.low) / (bar.high - bar.low)).toBeCloseTo(60 / 150, 10)
    // And 1170 is 30 s in: 20%.
    expect((bar.methods[0]!.at - bar.low) / (bar.high - bar.low)).toBeCloseTo(30 / 150, 10)
  })

  it('keeps the spread inside the bar with a margin either side, so a mark never sits on the edge', () => {
    const bar = alone(FIVE_K)
    expect(bar.low).toBeGreaterThan(0)
    expect(bar.high).toBeLessThan(1)
    expect(bar.low).toBeCloseTo(1 - bar.high, 10)
  })

  it('keeps each method with the estimate it names, in the order the prediction lists them', () => {
    expect(alone(FIVE_K).methods.map((mark) => mark.method)).toEqual(['performances', 'heartRate'])
  })

  it('widens the scale for an estimate outside the spread, and draws it where it is', () => {
    const outside: RacePrediction = {
      ...FIVE_K,
      methods: [{ method: 'heartRate', seconds: 1350, fromM: 5000 }],
    }
    const bar = alone(outside)
    expect(bar.methods[0]!.at).toBeGreaterThan(bar.high)
    expect(bar.methods[0]!.at).toBeLessThan(1)
    expect(bar.low).toBeGreaterThan(0)
    // The spread is narrower on a scale that has to hold the outlier.
    expect(bar.high - bar.low).toBeLessThan(alone(FIVE_K).high - alone(FIVE_K).low)
  })

  it('draws a prediction that sits at the quick end of its spread at the left cap', () => {
    const bar = alone({ ...FIVE_K, seconds: 1140, methods: [] })
    expect(bar.prediction).toBeCloseTo(bar.low, 10)
  })

  it('does not divide by zero for a spread of no width', () => {
    const bar = alone({ distanceM: 5000, seconds: 1200, low: 1200, high: 1200, methods: [] })
    expect([bar.low, bar.high, bar.prediction].every(Number.isFinite)).toBe(true)
  })

  it('draws a recorded best where it is, quicker than the prediction, and widens the scale for it', () => {
    const without = alone(FIVE_K)
    expect(without.ran).toBeNull()
    // 18:00 is quicker than the spread's low end of 19:00, so it sets the left of the scale.
    const bar = alone(FIVE_K, 1080)
    expect(bar.ran).toBeCloseTo(0.04, 10)
    expect(bar.ran!).toBeLessThan(bar.low)
    expect(bar.ran!).toBeLessThan(bar.prediction)
  })
})

describe('raceBar on a scale shared by several races', () => {
  /** A marathon predicted at 3:30:00, spread 3:12:00 to 3:52:00: wider, as a share of its time, than the 5 km's. */
  const MARATHON: RacePrediction = {
    distanceM: 42_195,
    seconds: 12_600,
    low: 11_520,
    high: 13_920,
    methods: [{ method: 'performances', seconds: 12_300, fromM: 21_097 }],
  }
  const scale = raceScale([FIVE_K, MARATHON])

  it('draws the race with the wider relative spread as the wider band', () => {
    const five = raceBar(FIVE_K, scale)
    const marathon = raceBar(MARATHON, scale)
    expect(marathon.high - marathon.low).toBeGreaterThan(five.high - five.low)
    // 150 s of 1200 is 12.5% of the 5 km's time; 2400 s of 12600 is 19% of the marathon's.
    const ratio = (marathon.high - marathon.low) / (five.high - five.low)
    expect(ratio).toBeCloseTo(2400 / 12_600 / (150 / 1200), 6)
  })

  it('stands every prediction at one place along its bar, whatever the race', () => {
    expect(raceBar(FIVE_K, scale).prediction).toBeCloseTo(raceBar(MARATHON, scale).prediction, 10)
  })

  it('holds every mark of every race inside the bar, clear of its edges', () => {
    for (const race of [FIVE_K, MARATHON]) {
      const bar = raceBar(race, scale)
      for (const at of [bar.low, bar.high, bar.prediction, ...bar.methods.map((m) => m.at)]) {
        expect(at).toBeGreaterThan(0)
        expect(at).toBeLessThan(1)
      }
    }
  })

  it('lets a recorded best on one race widen the scale of them all', () => {
    const wider = raceScale([FIVE_K, MARATHON], new Map([[5000, 900]]))
    expect(wider.below).toBeGreaterThan(scale.below)
  })
})
