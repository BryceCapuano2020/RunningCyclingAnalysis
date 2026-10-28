import { describe, expect, it } from 'vitest'
import { BEST_WINDOW_MIN_MOVING_FRACTION, PRIORS, RESTING_W_PER_KG } from '../constants'
import { parseGpx } from '../gpx/parse'
import { digestActivity } from './digestActivity'
import { syntheticActivity } from './test/syntheticActivity'

/** Metabolic W/kg of running at speed v on the flat, with the prior-mean economy. */
const flatMetabolic = (v: number) => RESTING_W_PER_KG + PRIORS.runEconomyScale.mean * 3.9 * v
const METRES_PER_DEGREE = 111_195

/** One stretch of a track: fixes every `everyS` seconds from `fromS` up to `toS`, moving at `speed`. */
interface Leg {
  fromS: number
  toS: number
  speed: number
  everyS?: number
}

/** A GPX track going north through the legs. Seconds between legs have no fix, which is a gap. */
function gpxRun(legs: Leg[]): ReturnType<typeof parseGpx> {
  let lat = 51
  const points: string[] = []
  for (const leg of legs) {
    for (let s = leg.fromS; s <= leg.toS; s += leg.everyS ?? 1) {
      const time = new Date(Date.UTC(2020, 0, 1, 10, 0, s)).toISOString()
      points.push(
        `<trkpt lat="${lat.toFixed(7)}" lon="-0.1"><ele>20</ele><time>${time}</time></trkpt>`,
      )
      lat += (leg.speed * (leg.everyS ?? 1)) / METRES_PER_DEGREE
    }
  }
  const xml =
    '<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">' +
    `<trk><type>running</type><trkseg>${points.join('')}</trkseg></trk></gpx>`
  return parseGpx(new TextEncoder().encode(xml), 'sparse.gpx')
}

function digestOf(legs: Leg[]) {
  const parsed = gpxRun(legs)
  if (!parsed.ok) throw new Error('fixture did not parse')
  return digestActivity(parsed.activities[0]!)
}

const valueAt = (digest: ReturnType<typeof digestOf>, durationS: number): number =>
  digest.curve.find((p) => p.durationS === durationS)!.value

describe('best efforts from sparse and noisy GPS files', () => {
  it('does not credit a sustained impossible speed in a position-derived track', () => {
    // Steady 3 m/s, then 3 minutes at 9.5 m/s (a 2:49 mile) with nothing to disagree with it.
    const digest = digestOf([
      { fromS: 0, toS: 900, speed: 3 },
      { fromS: 901, toS: 1081, speed: 9.5 },
      { fromS: 1082, toS: 1900, speed: 3 },
    ])
    expect(digest.flags.map((f) => f.kind)).toContain('implausible-speed')
    // The best 2 minutes is the steady pace, not the glitch.
    expect(valueAt(digest, 120)).toBeLessThan(flatMetabolic(4))
    expect(valueAt(digest, 300)).toBeLessThan(flatMetabolic(4))
  })

  it('does not credit a fast window that is mostly stopped or unrecorded', () => {
    // Fast running either side of a 70 s gap with no fixes. Any 5 minute window over the gap is 77%
    // moving; read as an effort it would be a 5.3 m/s average.
    const digest = digestOf([
      { fromS: 0, toS: 600, speed: 3 },
      { fromS: 601, toS: 760, speed: 6.9 },
      { fromS: 830, toS: 900, speed: 6.9 },
      { fromS: 901, toS: 1500, speed: 3 },
    ])
    const best = digest.curve.find((p) => p.durationS === 300)!
    const overGap = Math.max(
      0,
      Math.min(best.startIndex + best.windowS, 830) - Math.max(best.startIndex, 760),
    )
    expect(overGap).toBeLessThanOrEqual((1 - BEST_WINDOW_MIN_MOVING_FRACTION) * best.windowS)
  })

  it('keeps a genuine fast effort: a 4:52 mile pace for five minutes, and a 2:54 kilometre', () => {
    const digest = digestOf([
      { fromS: 0, toS: 600, speed: 3 },
      { fromS: 601, toS: 901, speed: 5.5 },
      { fromS: 902, toS: 1100, speed: 3 },
      { fromS: 1101, toS: 1275, speed: 1000 / 174 },
      { fromS: 1276, toS: 1800, speed: 3 },
    ])
    expect(digest.flags.map((f) => f.kind)).not.toContain('implausible-speed')
    expect(valueAt(digest, 300)).toBeGreaterThan(flatMetabolic(5.3))
    const km = digest.distanceBests!.find((b) => b.distanceM === 1000)!
    expect(km.seconds).toBeGreaterThan(172)
    // The track's speed is smoothed over a few seconds, so the time is close to 2:54, not exact.
    expect(km.seconds).toBeLessThan(180)
  })
})

describe('best windows over pauses', () => {
  const paused = (n: number, from: number, to: number) => {
    const mask = new Uint8Array(n)
    mask.fill(1, from, to)
    return mask
  }

  it('does not let a fast burst win a window that is more than a tenth paused', () => {
    const n = 1400
    const speed = new Float64Array(n).fill(3)
    speed.fill(6, 400, 700)
    // A 40 s pause inside the burst: a 300 s window over it is 87% moving.
    speed.fill(0, 550, 590)
    const pausedMask = paused(n, 550, 590)
    const digest = digestActivity(syntheticActivity({ n, speed, paused: pausedMask }))
    const best = digest.curve.find((p) => p.durationS === 300)!
    let stopped = 0
    for (let i = best.startIndex; i < best.startIndex + best.windowS; i++) stopped += pausedMask[i]!
    expect(stopped).toBeLessThanOrEqual((1 - BEST_WINDOW_MIN_MOVING_FRACTION) * best.windowS + 1e-9)
  })

  it('has no hour best for an hour that is mostly paused', () => {
    const n = 4000
    const pausedMask = paused(n, 1500, 3700)
    const speed = new Float64Array(n).fill(3)
    speed.fill(0, 1500, 3700)
    const digest = digestActivity(syntheticActivity({ n, speed, paused: pausedMask }))
    const hour = digest.curve.find((p) => p.durationS === 3600)!
    expect(hour.startIndex).toBe(-1)
    expect(hour.value).toBeNaN()
    // The 20 minutes inside the moving part is still a best.
    expect(valueAt(digest, 1200)).toBeGreaterThan(flatMetabolic(2.9))
  })

  it('is unchanged for an activity that is never paused', () => {
    const n = 800
    const speed = new Float64Array(n).fill(3)
    speed.fill(5, 300, 500)
    const digest = digestActivity(syntheticActivity({ n, speed }))
    expect(digest.curve.find((p) => p.durationS === 120)!.startIndex).toBeGreaterThanOrEqual(300)
    expect(valueAt(digest, 120)).toBeGreaterThan(flatMetabolic(4.9))
  })
})
