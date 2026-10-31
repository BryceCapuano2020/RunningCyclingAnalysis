import { describe, expect, it } from 'vitest'
import { DAY_MS, DEFAULT_BIKE_MODEL, HEADLINE_DURATION_S } from '../constants'
import { SPRINT_S, hardEffortRule } from '../digest/hardEffortRule'
import type { EffortReference } from '../effort'
import { PeriodCache } from '../periodCache'
import type { ActivityDigest, DigestCurvePoint, Sport } from '../types'
import { changeEvidence } from './evidence'
import { effortLibrary, SETTINGS } from './test/library'
import { callAt } from './types'

const REFERENCE_BPM = 200
const PEAK = { hard: 190, easy: 140 }

const reference = (reading: EffortReference['reading']['run'] = 'trusted'): EffortReference => ({
  referenceHr: { run: REFERENCE_BPM, ride: REFERENCE_BPM },
  reading: { run: reading, ride: reading },
  source: { run: 'data', ride: 'data' },
  from: { run: null, ride: null },
})

const [BASE] = effortLibrary({ sport: 'ride', perWeek: 1, weeks: 1, seed: 1 }) as [ActivityDigest]

/** An activity with the given peak and average heart rate (bpm, no distribution so the peak alone is judged). */
const withHeartRate = (
  peak: number | null,
  average: number | null,
  id = 'a',
  over: Partial<ActivityDigest> = {},
): ActivityDigest =>
  Object.assign({}, BASE, {
    id,
    maxHeartRate: peak,
    avgHeartRate: average,
    distributions: undefined,
    ...over,
  })

const pointAt = (digest: ActivityDigest, durationS: number): DigestCurvePoint =>
  digest.curve.find((p) => p.durationS === durationS)!

const counts = (
  digest: ActivityDigest,
  durationS: number,
  ref = reference(),
  setAside: string[] = [],
): boolean => hardEffortRule(ref, setAside).rule.point(digest, pointAt(digest, durationS))

describe('the hard-effort reading rule', () => {
  const hard = withHeartRate(PEAK.hard, PEAK.hard * 0.85)
  const easy = withHeartRate(PEAK.easy, PEAK.easy * 0.85)

  it('counts an effort of up to 20 minutes by its session’s peak heart rate', () => {
    expect(counts(hard, HEADLINE_DURATION_S)).toBe(true)
    expect(counts(easy, HEADLINE_DURATION_S)).toBe(false)
    expect(counts(easy, 300)).toBe(false)
  })

  it('counts a steady effort of an hour or more by the session’s average, which sits under the hard line', () => {
    // A 90 minute steady best: peak at 75% of the reference (under the hard line), average at 82%.
    const steady = withHeartRate(150, 164)
    expect(counts(steady, HEADLINE_DURATION_S)).toBe(false)
    expect(counts(steady, 3600)).toBe(true)
    // The same ride at 60% on average is easy.
    expect(counts(withHeartRate(150, 120), 3600)).toBe(false)
  })

  it('counts a sprint inside an easy ride, which a 30 s heart rate cannot show', () => {
    expect(counts(easy, SPRINT_S)).toBe(true)
    expect(counts(easy, 5)).toBe(true)
    expect(counts(easy, SPRINT_S * 2)).toBe(false)
  })

  it('does not count an effort heart rate cannot judge: it is read in neither period', () => {
    expect(counts(withHeartRate(null, null), HEADLINE_DURATION_S)).toBe(false)
    expect(counts(withHeartRate(null, null), 3600)).toBe(false)
    expect(counts(hard, HEADLINE_DURATION_S, reference('thin'))).toBe(false)
    expect(counts(hard, HEADLINE_DURATION_S, reference(null))).toBe(false)
    expect(counts(hard, HEADLINE_DURATION_S, reference(), [hard.id])).toBe(false)
  })

  it('does not count an effort against a reference that cannot certify a maximum', () => {
    expect(counts(hard, HEADLINE_DURATION_S, reference('habitual'))).toBe(false)
    expect(counts(hard, 3600, reference('low'))).toBe(false)
    expect(counts(hard, SPRINT_S, reference('low'))).toBe(true)
  })

  it('still leaves out a treadmill run', () => {
    const rule = hardEffortRule(reference(), []).rule
    expect(rule.activity({ ...hard, sport: 'run', indoor: true })).toBe(false)
    expect(rule.activity(hard)).toBe(true)
  })

  it('has a key that changes with the references and the set-aside list, so a cached result is not reused for another', () => {
    const base = hardEffortRule(reference(), []).key
    expect(hardEffortRule(reference(), []).key).toBe(base)
    expect(hardEffortRule(reference('habitual'), []).key).not.toBe(base)
    expect(
      hardEffortRule({ ...reference(), referenceHr: { run: 190, ride: 200 } }, []).key,
    ).not.toBe(base)
    expect(hardEffortRule(reference(), ['a']).key).not.toBe(base)
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
      hardEffortRule(reference(), []),
    )
    expect(gated).not.toBe(every)
    expect(cache.change(p.selected, p.previous, SETTINGS, DEFAULT_BIKE_MODEL, null)).toBe(every)
  })
})

/** Two 12 week periods of one equal capability, the later one `laterHard` hard and the earlier one `earlierHard`. */
function periods(
  sport: Sport,
  seed: number,
  earlierHard: number,
  laterHard: number,
  strapped: { earlier: boolean; later: boolean } = { earlier: true, later: true },
) {
  const library = (
    hardShare: number,
    offsetWeeks: number,
    salt: number,
    strap: boolean,
  ): ActivityDigest[] =>
    effortLibrary({
      sport,
      perWeek: 4,
      weeks: 12,
      seed: seed * 2 + salt,
      hardShare,
      peakHeartRate: PEAK,
    }).map((digest) =>
      Object.assign(
        {},
        digest,
        { startMs: digest.startMs + offsetWeeks * 7 * DAY_MS },
        strap ? {} : { maxHeartRate: null, avgHeartRate: null },
      ),
    )
  return {
    previous: library(earlierHard, 0, 0, strapped.earlier),
    selected: library(laterHard, 12, 1, strapped.later),
  }
}

const callOf = (p: ReturnType<typeof periods>, sport: Sport, gated: boolean) =>
  callAt(
    changeEvidence(
      p.selected,
      p.previous,
      SETTINGS,
      DEFAULT_BIKE_MODEL,
      null,
      gated ? hardEffortRule(reference(), []).rule : undefined,
    ),
    sport,
    HEADLINE_DURATION_S,
  )!

describe('a swing in how many hard efforts a period holds is not a change', () => {
  // Equal capability, 4 efforts a week: the earlier period 30% hard, the later 90%. Read through every effort, the later
  // period's best is higher by the number of hard efforts alone. Observed over 60 seeds, run and ride alike: 19 and 20 called
  // higher without the rule; with it 2 and 1 of the calls made from the hard efforts, and the 5 and 5 seeds whose earlier
  // period holds too few hard efforts are read from every effort in both and say so (`gated` false).
  const SEEDS = 60
  const tally = (sport: Sport, gated: boolean) => {
    let called = 0
    let judged = 0
    for (let seed = 1; seed <= SEEDS; seed++) {
      const call = callOf(periods(sport, seed, 0.3, 0.9), sport, gated)
      if (gated && !call.gated) continue
      judged++
      if (call.verdict === 'higher') called++
    }
    return { called, judged }
  }

  it.each<Sport>(['run', 'ride'])(
    'calls a %s higher far less often once easy efforts do not read',
    (sport) => {
      const every = tally(sport, false)
      const hard = tally(sport, true)
      expect(every.called / every.judged).toBeGreaterThan(0.25)
      expect(hard.judged).toBeGreaterThan(SEEDS * 0.8)
      expect(hard.called / hard.judged).toBeLessThan(0.08)
    },
  )

  it('reads the same efforts when every one is hard', () => {
    const p = periods('run', 3, 1, 1)
    const call = callOf(p, 'run', true)
    expect(call.gated).toBe(true)
    expect({ ...call, gated: false }).toEqual(callOf(p, 'run', false))
  })
})

describe('the two periods are read alike when only one was recorded with heart rate', () => {
  // The earlier period 30% hard and the later 90%, equal capability. Dropping the unrecorded efforts of one period while
  // keeping all of the other's would bring the swing back, so the call is made from every effort in both.
  const SEEDS = 40

  it('falls back to every effort in both periods when the earlier one has no strap', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const p = periods('run', seed, 0.3, 0.9, { earlier: false, later: true })
      const call = callOf(p, 'run', true)
      expect(call.gated).toBe(false)
      expect(call).toEqual(callOf(p, 'run', false))
    }
  })

  it('does not call a swing a change when one period has no strap, as with a strap in both', () => {
    let called = 0
    for (let seed = 1; seed <= SEEDS; seed++) {
      const p = periods('run', seed, 0.3, 0.9, { earlier: false, later: true })
      if (callOf(p, 'run', true).verdict === 'higher') called++
    }
    // Every effort counts in both, so the swing reads as it does with no gate at all; the call says the effort was not checked.
    const ungated = Array.from({ length: SEEDS }, (_, i) =>
      callOf(periods('run', i + 1, 0.3, 0.9), 'run', false),
    ).filter((call) => call.verdict === 'higher').length
    expect(called).toBe(ungated)
    expect(
      callOf(periods('run', 1, 0.3, 0.9, { earlier: false, later: true }), 'run', true).gated,
    ).toBe(false)
  })

  it('drops the efforts without heart rate from both periods when enough of the rest hold', () => {
    // Half of the earlier period's efforts have no strap: the later period's unrecorded ones are not kept against them.
    const p = periods('run', 5, 0.9, 0.9)
    const half = (digests: ActivityDigest[]) =>
      digests.map((d, i) => (i % 2 === 0 ? { ...d, maxHeartRate: null, avgHeartRate: null } : d))
    const mixed = { selected: p.selected, previous: half(p.previous) }
    const call = callOf(mixed, 'run', true)
    expect(call.gated).toBe(true)
    // Only efforts with a heart rate read, on both sides.
    expect(call.before).toBeLessThan(callOf(mixed, 'run', false).before)
    expect(call.now).toBeLessThan(callOf(mixed, 'run', false).now + 1)
  })
})
