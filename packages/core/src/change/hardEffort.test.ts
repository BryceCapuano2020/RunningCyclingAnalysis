import { describe, expect, it } from 'vitest'
import { DAY_MS, DEFAULT_BIKE_MODEL, HEADLINE_DURATION_S } from '../constants'
import type { EffortReference } from '../effort'
import { hardEffortRule } from '../digest/hardEffortRule'
import { PeriodCache } from '../periodCache'
import type { ActivityDigest, Sport } from '../types'
import { changeEvidence } from './evidence'
import { effortLibrary, SETTINGS } from './test/library'
import { callAt } from './types'

const REFERENCE_BPM = 200
const PEAK = { hard: 190, easy: 140 }

const trusted = (reading: EffortReference['reading']['run'] = 'trusted'): EffortReference => ({
  referenceHr: { run: REFERENCE_BPM, ride: REFERENCE_BPM },
  reading: { run: reading, ride: reading },
  source: { run: 'data', ride: 'data' },
  from: { run: null, ride: null },
})

/** Two 12 week periods of one equal capability, the later one `laterHard` hard and the earlier one `earlierHard`. */
function periods(sport: Sport, seed: number, earlierHard: number, laterHard: number) {
  const library = (hardShare: number, offsetWeeks: number, salt: number): ActivityDigest[] =>
    effortLibrary({
      sport,
      perWeek: 4,
      weeks: 12,
      seed: seed * 2 + salt,
      hardShare,
      peakHeartRate: PEAK,
    }).map((digest) =>
      Object.assign({}, digest, { startMs: digest.startMs + offsetWeeks * 7 * DAY_MS }),
    )
  return { previous: library(earlierHard, 0, 0), selected: library(laterHard, 12, 1) }
}

const verdictOf = (
  p: ReturnType<typeof periods>,
  sport: Sport,
  rule?: ReturnType<typeof hardEffortRule>,
) =>
  callAt(
    changeEvidence(p.selected, p.previous, SETTINGS, DEFAULT_BIKE_MODEL, null, rule?.rule),
    sport,
    HEADLINE_DURATION_S,
  )!.verdict

describe('the hard-effort reading rule', () => {
  const [easy, hard] = [
    { ...effortLibrary({ sport: 'run', perWeek: 1, weeks: 1, seed: 1 })[0]!, id: 'a' },
    { ...effortLibrary({ sport: 'run', perWeek: 1, weeks: 1, seed: 1 })[0]!, id: 'b' },
  ]
  const withPeak = (digest: ActivityDigest, maxHeartRate: number | null): ActivityDigest =>
    Object.assign({}, digest, { maxHeartRate, distributions: undefined })
  const counts = (
    digest: ActivityDigest,
    reference = trusted(),
    setAside: string[] = [],
  ): boolean => hardEffortRule(reference, setAside).rule.activity(digest)

  it('leaves out an activity whose peak heart rate was under the hard line', () => {
    expect(counts(withPeak(easy, PEAK.easy))).toBe(false)
    expect(counts(withPeak(hard, PEAK.hard))).toBe(true)
  })

  it('counts an activity that cannot be judged, since nothing shows it was easy', () => {
    expect(counts(withPeak(easy, null))).toBe(true)
    expect(counts(withPeak(easy, PEAK.easy), trusted('thin'))).toBe(true)
    expect(counts(withPeak(easy, PEAK.easy), trusted(null))).toBe(true)
    expect(counts(withPeak(easy, PEAK.easy), trusted(), [easy.id])).toBe(true)
  })

  it('leaves out every activity with a heart rate against a reference that cannot certify a maximum', () => {
    expect(counts(withPeak(hard, PEAK.hard), trusted('habitual'))).toBe(false)
    expect(counts(withPeak(hard, PEAK.hard), trusted('low'))).toBe(false)
    expect(counts(withPeak(hard, null), trusted('low'))).toBe(true)
  })

  it('still leaves out a treadmill run', () => {
    expect(counts({ ...withPeak(hard, PEAK.hard), indoor: true })).toBe(false)
  })

  it('has a key that changes with the references and the set-aside list, so a cached result is not reused for another', () => {
    const base = hardEffortRule(trusted(), []).key
    expect(hardEffortRule(trusted(), []).key).toBe(base)
    expect(hardEffortRule(trusted('habitual'), []).key).not.toBe(base)
    expect(hardEffortRule({ ...trusted(), referenceHr: { run: 190, ride: 200 } }, []).key).not.toBe(
      base,
    )
    expect(hardEffortRule(trusted(), ['a']).key).not.toBe(base)
  })

  it('is what the period cache keys the test on', () => {
    const p = periods('run', 1, 0.5, 0.5)
    const cache = new PeriodCache()
    const every = cache.change(p.selected, p.previous, SETTINGS, DEFAULT_BIKE_MODEL, null)
    const gated = cache.change(
      p.selected,
      p.previous,
      SETTINGS,
      DEFAULT_BIKE_MODEL,
      null,
      hardEffortRule(trusted(), []),
    )
    expect(gated).not.toBe(every)
    expect(cache.change(p.selected, p.previous, SETTINGS, DEFAULT_BIKE_MODEL, null)).toBe(every)
  })
})

describe('a swing in how many hard efforts a period holds is not a change', () => {
  // Equal capability, 4 efforts a week: the earlier period 30% hard, the later 90%. Read through every effort, the later
  // period's best is higher by the number of hard efforts alone. Observed over 60 seeds, run and ride alike: 19 and 20 called
  // higher without the rule, 2 and 1 with it (5 of 60 untested, for want of hard readings in the earlier period).
  const SEEDS = 60
  const tally = (sport: Sport, gated: boolean) => {
    let called = 0
    let untested = 0
    for (let seed = 1; seed <= SEEDS; seed++) {
      const p = periods(sport, seed, 0.3, 0.9)
      const rule = gated ? hardEffortRule(trusted(), []) : undefined
      const verdict = verdictOf(p, sport, rule)
      if (verdict === 'higher') called++
      if (verdict === 'untested') untested++
    }
    return { called, untested }
  }

  it.each<Sport>(['run', 'ride'])(
    'calls a %s higher far less often once easy efforts do not read',
    (sport) => {
      const without = tally(sport, false)
      const withRule = tally(sport, true)
      expect(without.called / SEEDS).toBeGreaterThan(0.25)
      expect(withRule.called / SEEDS).toBeLessThan(0.08)
    },
  )

  it('reads the same efforts when every one is hard', () => {
    const p = periods('run', 3, 1, 1)
    const gated = changeEvidence(
      p.selected,
      p.previous,
      SETTINGS,
      DEFAULT_BIKE_MODEL,
      null,
      hardEffortRule(trusted(), []).rule,
    )
    expect(gated).toEqual(
      changeEvidence(p.selected, p.previous, SETTINGS, DEFAULT_BIKE_MODEL, null),
    )
  })

  it('counts the readings that are hard when it asks for a size', () => {
    const p = periods('run', 5, 0, 1)
    // An earlier period with no hard effort has no reading to set the later one against.
    expect(verdictOf(p, 'run', hardEffortRule(trusted(), []))).toBe('untested')
  })
})
