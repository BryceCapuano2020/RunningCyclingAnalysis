import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { plantedLibrary } from '../findings/test/plantedLibrary'
import { AnalysisSession } from '../session'
import type { AthleteSettings } from '../types'
import { leadOf, meetsLeadBar } from './lead'
import type { LiveState } from './lead'
import { bestRows, episodeRow, episodeSentence, leadSentence, tooShortText } from './copy'
import { lookBackOf, NO_LOOKBACK } from './compute'
import type { LookBack, SportLookBack } from './compute'
import { fitnessHistories } from '../fitness/compute'
import { dayOfMs } from '../fitness/machine'
import { hindsightOf } from './hindsight'
import { orderedFor } from '../digest/consumers'
import { ownRideGate } from '../digest/estimatedRide'
import { hasEstimatedRide } from '../records/progression'
import { milestonesOf } from './milestones'
import type { EffortMilestones, HindsightEpisode, HindsightFitness, Plateau } from './types'

const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const NONE: ReadonlySet<string> = new Set()
const NOISE = { noise: 0.03, noiseModel: { autocorrelation: 0.9, heavyTails: true } }
const YEAR = 365.25 * DAY_MS
const T0 = Date.UTC(2021, 0, 4)

const library = () =>
  plantedLibrary({
    seed: 7,
    weeks: 260,
    perWeek: 3,
    ...NOISE,
    effects: [{ type: 'efficiency-shift', atWeek: 110, size: -0.2 }],
  })

describe('a library through lookBackOf', () => {
  const planted = library()
  const look = lookBackOf(planted.digests, SETTINGS, NONE, planted.lastMs)

  it('tells the run years, told through twelve weeks before the newest activity', () => {
    expect(look.horizonMs).toBeLessThan(look.asOfMs - 11 * 7 * DAY_MS)
    expect(look.horizonMs).toBeGreaterThan(look.asOfMs - 13 * 7 * DAY_MS)
    const run = look.sports.run.fitness
    expect(run.kind).toBe('ok')
    const years = run as HindsightFitness
    expect(years.toMs).toBeLessThanOrEqual(look.horizonMs)
    expect(years.episodes.some((e) => e.kind === 'slip-open')).toBe(true)
    expect(look.sports.run.referenceHr).not.toBeNull()
  })

  it('has milestones for the run, with a best, years oldest first and units', () => {
    const efforts = look.sports.run.milestones
    expect(efforts.length).toBeGreaterThan(0)
    for (const m of efforts) {
      expect(['m/s', 's']).toContain(m.unit)
      expect(m.years.map((y) => y.year)).toEqual([...m.years.map((y) => y.year)].sort())
      const top =
        m.unit === 's'
          ? Math.min(...m.years.map((y) => y.value))
          : Math.max(...m.years.map((y) => y.value))
      expect(m.best.value).toBe(top)
      expect(m.years.filter((y) => y.partial).length).toBeLessThanOrEqual(1)
    }
  })

  it('is remembered for the same digests, and empty for no library', () => {
    expect(lookBackOf(planted.digests, SETTINGS, NONE, planted.lastMs)).toBe(look)
    expect(lookBackOf([], SETTINGS, NONE, 0)).toBe(NO_LOOKBACK)
  })

  it('is small however long the library: no list past its cap, nothing per week', () => {
    expect(JSON.stringify(look).length).toBeLessThan(18_000)
    const longest = (value: unknown): number =>
      Array.isArray(value)
        ? Math.max(value.length, ...value.map(longest))
        : typeof value === 'object' && value !== null
          ? Math.max(0, ...Object.values(value).map(longest))
          : 0
    expect(longest(look)).toBeLessThanOrEqual(16)
  })

  it('reads the years with what the card said week by week, so a recovery it confirmed is not called less', () => {
    const dip = plantedLibrary({
      seed: 8,
      weeks: 260,
      perWeek: 3,
      ...NOISE,
      effects: [
        { type: 'efficiency-shift', atWeek: 90, size: -0.1 },
        { type: 'efficiency-shift', atWeek: 150, size: 0.1 },
      ],
    })
    const asOfMs = dip.lastMs
    const history = fitnessHistories(dip.digests, NONE).run
    expect(history.records.length).toBeGreaterThan(200)
    const told = lookBackOf(dip.digests, SETTINGS, NONE, asOfMs).sports.run.fitness
    const direct = hindsightOf({
      runs: history.runs,
      activeDays: dip.digests.map((d) => dayOfMs(d.startMs)),
      asOfDay: dayOfMs(asOfMs),
      records: history.records,
    })
    expect(told).toEqual(direct)
  })

  it('is the session state field, built with the state', () => {
    const state = new AnalysisSession().loadDigests(planted.digests, SETTINGS)
    expect(state.lookBack.sports.run.fitness.kind).toBe('ok')
  })
})

describe('milestones', () => {
  it("are the same with the library's own gate as with none, when no ride is an estimate", () => {
    const planted = plantedLibrary({
      seed: 5,
      weeks: 160,
      perWeek: 4,
      sports: ['run', 'ride'],
      ...NOISE,
      effects: [],
    })
    const ordered = orderedFor('records', planted.digests)
    expect(hasEstimatedRide(ordered)).toBe(false)
    expect(ownRideGate(ordered)).not.toBeNull()
    expect(milestonesOf(planted.digests, SETTINGS)).toEqual(
      milestonesOf(planted.digests, SETTINGS, ownRideGate(ordered)),
    )
  })

  it('compare two complete calendar years by the change test and never the one in progress', () => {
    const planted = plantedLibrary({ seed: 3, weeks: 190, perWeek: 3, ...NOISE, effects: [] })
    const run = milestonesOf(planted.digests, SETTINGS)
    const twenty = run.run.find((m) => m.effort.kind === 'duration' && m.effort.durationS === 1200)
    expect(twenty).toBeDefined()
    const partial = twenty!.years.find((y) => y.partial)?.year
    for (const v of twenty!.verdicts) {
      expect(v.year).not.toBe(partial)
      expect(['higher', 'lower', 'none', 'untested']).toContain(v.verdict)
    }
  })
})

/** A look-back built by hand, to read what leads and what it may say. */
function plateau(fromMs: number, toMs: number): Plateau {
  return { fromMs, toMs, value: 3.4, low: 3.3, high: 3.5, runs: 100 }
}

function episode(over: Partial<HindsightEpisode> = {}): HindsightEpisode {
  return {
    kind: 'improvement',
    fromMs: T0 + 2 * YEAR,
    toMs: T0 + 2.5 * YEAR,
    change: { value: 0.1, low: 0.07, high: 0.13 },
    regained: null,
    remaining: null,
    z: 7,
    steps: 1,
    runs: 90,
    ...over,
  }
}

function years(over: Partial<HindsightFitness> = {}): HindsightFitness {
  return {
    kind: 'ok',
    fromMs: T0,
    toMs: T0 + 4 * YEAR,
    runs: 400,
    levels: [plateau(T0, T0 + 2 * YEAR), plateau(T0 + 2 * YEAR, T0 + 4 * YEAR)],
    episodes: [episode()],
    omittedEpisodes: 0,
    quiet: [],
    thin: [],
    breaks: [],
    omittedSpans: 0,
    ...over,
  }
}

function look(run: HindsightFitness, over: Partial<SportLookBack> = {}): LookBack {
  return {
    asOfMs: T0 + 4 * YEAR + 12 * 7 * DAY_MS,
    horizonMs: T0 + 4 * YEAR,
    sports: {
      run: { sport: 'run', referenceHr: 148, fitness: run, milestones: [], ...over },
      ride: { sport: 'ride', referenceHr: null, fitness: { kind: 'unavailable' }, milestones: [] },
    },
  }
}

const live = (run: LiveState): Record<'run' | 'ride', LiveState> => ({ run, ride: null })

describe('what leads', () => {
  it('is the most recent episode that meets the lead bar: 7% and z 5.5, within five years, never under two years', () => {
    const strong = years()
    expect(meetsLeadBar(strong.episodes[0]!, strong)).toBe(true)
    const small = episode({ change: { value: 0.06, low: 0.03, high: 0.09 } })
    expect(meetsLeadBar(small, strong)).toBe(false)
    expect(meetsLeadBar(episode({ z: 5 }), strong)).toBe(false)
    expect(meetsLeadBar(episode({ fromMs: T0 - 8 * YEAR, toMs: T0 - 7 * YEAR }), strong)).toBe(
      false,
    )
    const short = years({ toMs: T0 + 1.5 * YEAR })
    expect(meetsLeadBar(strong.episodes[0]!, short)).toBe(false)
    const lead = leadOf(look(strong), live('holding'))
    expect(lead).toMatchObject({ kind: 'episode', sport: 'run' })
  })

  it('says a rise held only when the live status allows it', () => {
    const strong = years()
    for (const status of [
      'holding',
      'back',
      'improved',
      'not-enough-evidence',
      null,
    ] as LiveState[]) {
      expect(leadOf(look(strong), live(status))).toMatchObject({ held: true })
    }
    for (const status of ['slipping', 'holding-below', 'recovering', 'improving'] as LiveState[]) {
      expect(leadOf(look(strong), live(status))).toMatchObject({ held: false })
    }
  })

  it('offers a quiet stretch of a year or more that reaches the horizon, only when the live status allows it', () => {
    const quiet = years({
      episodes: [],
      quiet: [{ fromMs: T0 + YEAR, toMs: T0 + 4 * YEAR - DAY_MS, within: 0.04, runs: 300 }],
    })
    expect(leadOf(look(quiet), live('holding'))).toMatchObject({ kind: 'quiet' })
    for (const status of ['slipping', 'holding-below', 'recovering', 'improving'] as LiveState[]) {
      expect(leadOf(look(quiet), live(status))).toBeNull()
    }
  })

  it('does not lead on a slip still open at the horizon while the card shows a slip, a plateau, a recovery or a rise', () => {
    const open = years({
      episodes: [
        episode({
          kind: 'slip-open',
          toMs: null,
          fromMs: T0 + 3 * YEAR,
          change: { value: -0.1, low: -0.13, high: -0.07 },
          z: -7,
        }),
      ],
    })
    expect(meetsLeadBar(open.episodes[0]!, open)).toBe(true)
    for (const status of ['slipping', 'holding-below', 'recovering', 'improving'] as LiveState[]) {
      expect(leadOf(look(open), live(status))).toBeNull()
    }
    // An episode that has ended still leads beside it: the open slip is the card's to tell.
    const both = years({ episodes: [episode(), ...open.episodes] })
    expect(leadOf(look(both), live('slipping'))).toMatchObject({
      kind: 'episode',
      episode: { kind: 'improvement' },
    })
  })

  it('prefers a slip and its return, or one that was followed by a further fall, to a best that has stood', () => {
    const best: EffortMilestones = {
      effort: { kind: 'duration', durationS: 300 },
      unit: 'm/s',
      best: { value: 4.2, atMs: T0, id: 'a' },
      years: [],
      omittedYears: 0,
      steps: [],
      verdicts: [],
    }
    // Under the bar for a lead (7%, z 5.5), but listed and ended: news a best that has stood is not.
    const small = episode({
      kind: 'slip-back',
      change: { value: -0.05, low: -0.08, high: -0.02 },
      z: -3.5,
    })
    const quiet = years({ episodes: [small] })
    const lead = leadOf(look(quiet, { milestones: [best] }), live('holding'))
    expect(lead).toMatchObject({ kind: 'episode', sport: 'run', held: false })
    // One still open at the horizon is the card's to tell, and a best is all that is left.
    const open = years({ episodes: [{ ...small, kind: 'slip-open', toMs: null }] })
    expect(leadOf(look(open, { milestones: [best] }), live('holding'))).toMatchObject({
      kind: 'best',
    })
  })

  it('is never a statement that a library too short for its years has nothing yet', () => {
    const short = {
      kind: 'too-short',
      steady: 20,
      weeks: 30,
      needSteady: 40,
      needWeeks: 52,
    } as const
    expect(leadOf(look(short as never), live(null))).toBeNull()
  })
})

describe('the words', () => {
  const sport = look(years()).sports.run
  const fit = years()

  it('puts the year on every date and dates what it cannot see past the horizon', () => {
    const open = episodeSentence(
      episode({ kind: 'slip-open', toMs: null, change: { value: -0.07, low: -0.1, high: -0.04 } }),
      sport,
      fit,
    )
    expect(open).toMatch(
      /^From January 2023 your pace at 148 bpm was about \d+(\.\d)?% \(\d+ to \d+%\) slower, and in January 2025 it was still lower\./,
    )
    const held = episodeSentence(episode(), sport, fit, true)
    expect(held).toMatch(/and held there through January 2025\.$/)
    expect(episodeSentence(episode(), sport, fit, false)).not.toMatch(/held/)
  })

  it('says a return, and a part return with what is still missing', () => {
    const back = episodeSentence(
      episode({
        kind: 'slip-back',
        change: { value: -0.08, low: -0.1, high: -0.06 },
        regained: { value: 0.09, low: 0.06, high: 0.12 },
      }),
      sport,
      fit,
    )
    expect(back).toMatch(/By July 2023 it was back\.$/)
    const partly = episodeSentence(
      episode({
        kind: 'slip-partly-back',
        change: { value: -0.12, low: -0.15, high: -0.09 },
        regained: { value: 0.06, low: 0.03, high: 0.09 },
        remaining: { value: -0.06, low: -0.09, high: -0.03 },
      }),
      sport,
      fit,
    )
    // The baseline is named, so it reads as its own comparison beside the fitness card's "than before <day>".
    expect(partly).toMatch(/was still about .* slower than before [A-Z][a-z]+ \d{4}\.$/)
  })

  it('names a break and then the step after it', () => {
    const withBreak = years({
      breaks: [{ fromMs: Date.UTC(2022, 11, 5), toMs: Date.UTC(2023, 1, 20) }],
    })
    const text = episodeSentence(
      episode({
        kind: 'after-break',
        fromMs: Date.UTC(2023, 1, 25),
        change: { value: -0.06, low: -0.09, high: -0.03 },
      }),
      sport,
      withBreak,
    )
    expect(text).toMatch(
      /^No steady runs from December 2022 to February 2023\. When they resumed, your pace at 148 bpm was about .* slower\.$/,
    )
  })

  it('writes a best 20 min as a pace, never a time', () => {
    const rows = bestRows(
      {
        effort: { kind: 'duration', durationS: 1200 },
        unit: 'm/s',
        best: { value: 3.45, atMs: Date.UTC(2021, 4, 14), id: 'a' },
        years: [
          { year: 2020, partial: false, value: 3.2, id: 'b', n: 30 },
          { year: 2021, partial: false, value: 3.45, id: 'a', n: 40 },
          { year: 2022, partial: true, value: 3.3, id: 'c', n: 12 },
        ],
        omittedYears: 0,
        steps: [],
        verdicts: [
          { year: 2021, verdict: 'higher' },
          { year: 2020, verdict: 'none' },
        ],
      },
      Date.UTC(2022, 5, 1),
      'metric',
    )
    expect(rows[0]).toBe(
      'Best 20 min: 4:50 /km, set on 14 May 2021; it has stood 1 year 1 month as of 1 June 2022.',
    )
    expect(rows[1]).toBe('By year: 2020 5:13 /km, 2021 4:50 /km, 2022 (so far) 5:03 /km.')
    expect(rows).toContain('Faster in 2021 than in 2020.')
    expect(rows).toContain('No clear change from 2019 to 2020.')
    expect(rows.join(' ')).not.toMatch(/level with last time/)
  })

  it('tells a slip that was followed by a further fall as lower until then, not as still lower', () => {
    const closed = { ...fit.episodes[0]!, kind: 'slip-open' as const, toMs: Date.UTC(2023, 2, 1) }
    const said = [episodeSentence(closed, sport, fit), episodeRow(closed, sport, fit)].join(' ')
    expect(said).toContain('stayed lower until it fell again')
    expect(said).not.toMatch(/still lower/)
  })

  it('writes a ride in power: higher and lower, never faster and slower', () => {
    const ride = (unit: 'W' | 'W/kg') =>
      bestRows(
        {
          effort: { kind: 'duration', durationS: 1200 },
          unit,
          best: { value: 280, atMs: Date.UTC(2021, 4, 14), id: 'a' },
          years: [],
          omittedYears: 0,
          steps: [],
          verdicts: [
            { year: 2021, verdict: 'higher' },
            { year: 2022, verdict: 'lower' },
          ],
        },
        Date.UTC(2022, 5, 1),
        'metric',
      ).join(' ')
    for (const unit of ['W', 'W/kg'] as const) {
      expect(ride(unit)).toContain('Higher in 2021 than in 2020.')
      expect(ride(unit)).toContain('Lower in 2022 than in 2021.')
      expect(ride(unit)).not.toMatch(/faster|slower/i)
    }
  })

  it('uses none of the words the copy rules ban, and no cause', () => {
    const everything = [
      leadSentence(leadOf(look(fit), live('holding'))!, look(fit), 'metric'),
      episodeRow(fit.episodes[0]!, sport, fit),
      tooShortText({ kind: 'too-short', steady: 23, weeks: 19, needSteady: 40, needWeeks: 52 }),
    ].join(' ')
    expect(everything).not.toMatch(
      /limiter|weak|strength|holding you back|ahead of|because|caused|grade/i,
    )
  })

  it('says what a short library lacks, once', () => {
    expect(
      tooShortText({ kind: 'too-short', steady: 23, weeks: 19, needSteady: 40, needWeeks: 52 }),
    ).toBe(
      'Your years start to read once you have a year of steady running behind the latest 12 weeks: 40 steady runs over 52 weeks. So far there are 23 steady runs over 19 weeks.',
    )
  })
})
