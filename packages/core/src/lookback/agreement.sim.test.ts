import { describe, expect, it, vi } from 'vitest'
import type { SimSpec } from '../fitness/test/runSim'
import { agreement, rideAgreement, spanWeeks } from './test/agreement'
import type { Agreement } from './test/agreement'

vi.setConfig({ testTimeout: 900_000 })

/**
 * The look-back against the live monitor (design 1.3). For each simulated library: the look-back's call about the last
 * plateau at the horizon against the card's state as of the newest run (the confusion table), and the live declarations
 * against the hindsight episodes in both directions. 3, 2 and 5 steady runs a week, 60 libraries each, 200 weeks; seeds
 * 7001 up are held out from the 1 to 40 the constants were tuned on. Rides run through the real unit and card.
 *
 * The design bounds the forbidden cells at 3% before the lead is suppressed. They are not under it: the card's own false
 * alarms (about a quarter of one a year, open for months) are cells the look-back, which sees none, calls steady; and a
 * dip that returned to within 2% is called "partly back" by the strict test (design 1.2) while the card has closed it as
 * holding. These are measured here, with a ceiling a little over each rate, and `leadOf` is what keeps the look-back from
 * stating anything the card contradicts (see lookback.test.ts).
 */
const WEEKS = 200
const RATES = [2, 3, 5]
const LIBRARIES = 60
type Library = Partial<SimSpec> & Pick<SimSpec, 'weeks'>
const step = (week: number, size: number) => ({ type: 'step' as const, week, size })

const SETS = {
  'nothing changes': { weeks: WEEKS },
  'a fall of 8%': { weeks: WEEKS, planted: [step(100, -0.08)] },
  'a rise of 8%': { weeks: WEEKS, planted: [step(100, 0.08)] },
  'a dip of 8% for 50 weeks': { weeks: WEEKS, planted: [step(90, -0.08), step(140, 0.08)] },
  'a fall of 8%, 30 weeks ago': { weeks: WEEKS, planted: [step(170, -0.08)] },
  'a fall of 8% with 4% back': {
    weeks: WEEKS,
    planted: [step(100, -0.08), step(140, 0.04)],
  },
  'a fall of 8% inside the horizon': { weeks: WEEKS, planted: [step(192, -0.08)] },
} satisfies Record<string, Library>
type Name = keyof typeof SETS

function run(library: Library): Agreement[] {
  return RATES.flatMap((perWeek) =>
    Array.from({ length: LIBRARIES }, (_, i) => agreement({ ...library, perWeek }, 7000 + i + 1)),
  )
}

const LOSS = ['slipping', 'holding-below', 'recovering', 'improving']
/** The cells design 1.3 forbids: level or back said where the card shows a loss or a rise, or lower where it shows level or back. */
const forbidden = (a: Agreement) =>
  ((a.call === 'steady' || a.call === 'back') && LOSS.includes(a.live)) ||
  (a.call === 'lower' && (a.live === 'holding' || a.live === 'back'))
const share = (xs: Agreement[], f: (a: Agreement) => boolean) => xs.filter(f).length / xs.length
const callShare = (xs: Agreement[], call: Agreement['call']) => share(xs, (a) => a.call === call)

const libraries = {} as Record<Name, Agreement[]>
for (const name of Object.keys(SETS) as Name[]) libraries[name] = run(SETS[name])

describe('the call about the last plateau against the card, as of the newest run', () => {
  // Observed forbidden share (call by state, design 1.3), 180 libraries a set:
  //   nothing changes 0.206  (steady/holding 0.74; steady against the card's false alarms: holding-below 0.09, improving 0.07, slipping 0.04)
  //   a fall of 8% 0.011 (lower/holding-below 0.83, lower/slipping 0.14)      a rise of 8% 0.006 (higher/holding 0.89)
  //   a dip of 8% for 50 weeks 0.372 (back/holding 0.44, lower/holding 0.33: partly back against a closed card)
  //   a fall of 8%, 30 weeks ago 0.067    a fall of 8% with 4% back 0.289 (lower/holding-below 0.42, steady/holding-below 0.12)
  //   a fall of 8% inside the horizon 0.806 (steady/slipping 0.72): the card has it, the look-back is told through 12 weeks before.
  it.each([
    ['nothing changes', 0.25],
    ['a fall of 8%', 0.04],
    ['a rise of 8%', 0.04],
    ['a dip of 8% for 50 weeks', 0.45],
    ['a fall of 8%, 30 weeks ago', 0.12],
    ['a fall of 8% with 4% back', 0.35],
    ['a fall of 8% inside the horizon', 0.9],
  ] as const)('%s: forbidden cells stay under %f of libraries', (name, ceiling) => {
    expect(share(libraries[name], forbidden)).toBeLessThan(ceiling)
  })

  it('calls a library where nothing changed steady, and a planted change what it is', () => {
    expect(callShare(libraries['nothing changes'], 'steady')).toBeGreaterThan(0.9)
    expect(callShare(libraries['a fall of 8%'], 'lower')).toBeGreaterThan(0.9)
    expect(callShare(libraries['a rise of 8%'], 'higher')).toBeGreaterThan(0.9)
    expect(callShare(libraries['a dip of 8% for 50 weeks'], 'back')).toBeGreaterThan(0.35)
  })
})

describe('two-way agreement about a planted event', () => {
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!
  const p90 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.9)]!

  /** For the event planted at `week`: the live monitor declared it (within 16 weeks), and the look-back listed an episode within 8 weeks of it. */
  function agree(name: Name, week: number) {
    const cells = { both: 0, live: 0, hindsight: 0, neither: 0 }
    const lags: number[] = []
    for (const a of libraries[name]) {
      const live = a.declared.filter((w) => w >= week && w <= week + 16)
      const hind = a.years?.episodes.find((e) => {
        const s = spanWeeks(e, a.years!.toMs)
        return Math.abs(s.from - week) <= 8 || Math.abs(s.to - week) <= 8
      })
      if (live.length > 0 && hind !== undefined) {
        cells.both++
        lags.push(live[0]! - spanWeeks(hind, a.years!.toMs).from)
      } else if (live.length > 0) cells.live++
      else if (hind !== undefined) cells.hindsight++
      else cells.neither++
    }
    const n = libraries[name].length
    return { agree: (cells.both + cells.neither) / n, lags, ...cells }
  }

  // Observed (agree = both or neither; both / live only / hindsight only): a fall of 8% 0.91 (0.91 / 0.03 / 0.06), a dip 0.90
  // (0.89 / 0.05 / 0.06), a fall 30 weeks ago 0.88 (0.87 / 0.08 / 0.04); a rise of 8% 0.68 (0.67 / 0.02 / 0.31: the card's rise
  // test is the stricter), a fall with 4% back 0.70 (0.69 / 0.26 / 0.05: the card sees the fall and the look-back reads the
  // small return as part of one episode). The live declaration trails the hindsight start by 3 to 4 weeks (median), 7 to 9 (90th).
  it.each([
    ['a fall of 8%', 100],
    ['a dip of 8% for 50 weeks', 90],
    ['a fall of 8%, 30 weeks ago', 170],
  ] as const)('%s: both say so, or neither, in at least 85% of libraries', (name, week) => {
    expect(agree(name, week).agree).toBeGreaterThanOrEqual(0.85)
  })

  it('records the weaker cases without a bound beyond what was observed', () => {
    expect(agree('a rise of 8%', 100).agree).toBeGreaterThan(0.55)
    expect(agree('a fall of 8% with 4% back', 100).agree).toBeGreaterThan(0.55)
  })

  it('has the live declaration trail the hindsight start by a few weeks, not months', () => {
    const lags = (['a fall of 8%', 'a dip of 8% for 50 weeks'] as const).flatMap(
      (name) => agree(name, name === 'a fall of 8%' ? 100 : 90).lags,
    )
    expect(median(lags)).toBeLessThanOrEqual(6)
    expect(p90(lags)).toBeLessThanOrEqual(12)
  })
})

describe('rides, through the unit and the card', () => {
  const rides = (planted?: (w: number) => number) =>
    Array.from({ length: 30 }, (_, i) =>
      rideAgreement({
        weeks: 160,
        perWeek: 2,
        seed: 7001 + i,
        rideSd: 0.02,
        blockSd: 0.035,
        planted,
      }),
    )
  // Observed over the first 20 seeds: nothing changes steady/holding 0.70, forbidden 0.10; a fall of 8% lower in 0.95, forbidden 0.05.
  const quiet = rides()
  const fall = rides((w) => (w >= 100 ? -0.08 : 0))

  it('calls a quiet ride library steady, and keeps the forbidden cells low', () => {
    expect(callShare(quiet, 'steady')).toBeGreaterThan(0.85)
    expect(share(quiet, forbidden)).toBeLessThan(0.2)
  })

  it('calls a fall of 8% lower, against a card that shows it', () => {
    expect(callShare(fall, 'lower')).toBeGreaterThan(0.85)
    expect(share(fall, forbidden)).toBeLessThan(0.15)
  })
})
