import '../test/warmSample'
import { describe, expect, it } from 'vitest'
import { WEEK_ORIGIN_MS } from '../calendar'
import { DAY_MS } from '../constants'
import { plantedLibrary } from '../findings/test/plantedLibrary'
import { fitnessHistories, fitnessStatuses } from '../fitness/compute'
import { fitnessFindingHeadline } from '../fitness/copy'
import { formatDay } from '../findings/copy'
import { FITNESS } from '../fitness/params'
import { noFitness } from '../fitness/types'
import type { FitnessBySport, FitnessState, FitnessStatus } from '../fitness/types'
import { datedByLookBack } from './cardDates'
import type { CardRuns } from './cardDates'
import { lookBackOf, NO_LOOKBACK } from './compute'
import type { LookBack } from './compute'
import type { EpisodeKind, HindsightEpisode, HindsightFitness } from './types'

const WEEK = 7 * DAY_MS
const WEEKS_FROM = (week: number) => WEEK_ORIGIN_MS + week * WEEK
const NONE: ReadonlySet<string> = new Set()

const status = (state: FitnessState, over: Partial<FitnessStatus>): FitnessStatus => ({
  ...noFitness('run'),
  state,
  shortfall: null,
  asOfMs: WEEKS_FROM(200),
  ...over,
})

const episode = (
  kind: EpisodeKind,
  from: number,
  to: number | null,
  fall = -0.06,
): HindsightEpisode => ({
  kind,
  fromMs: WEEKS_FROM(from),
  toMs: to === null ? null : WEEKS_FROM(to),
  change: { value: fall, low: fall - 0.02, high: fall + 0.02 },
  regained: null,
  remaining: null,
  z: -5,
  steps: 1,
  runs: 30,
})

const years = (...episodes: HindsightEpisode[]): HindsightFitness => ({
  kind: 'ok',
  fromMs: WEEKS_FROM(0),
  toMs: WEEKS_FROM(188),
  runs: 400,
  levels: [],
  episodes,
  omittedEpisodes: 0,
  quiet: [],
  thin: [],
  breaks: [],
  omittedSpans: 0,
})

const lookBackWith = (run: HindsightFitness): LookBack => ({
  ...NO_LOOKBACK,
  sports: { ...NO_LOOKBACK.sports, run: { ...NO_LOOKBACK.sports.run, fitness: run } },
})

const cards = (run: FitnessStatus): FitnessBySport => ({ run, ride: noFitness('ride') })
const NO_RUNS: CardRuns = { run: { runs: [] }, ride: { runs: [] } }
const runOf = (run: FitnessStatus, look: HindsightFitness, runs: CardRuns = NO_RUNS) =>
  datedByLookBack(cards(run), lookBackWith(look), runs).run

describe('the dates the card names its episode by', () => {
  it('takes the start of the slip the look-back lists for the onset, and keeps a low that lies inside it', () => {
    const card = status('recovering', {
      onsetMs: WEEKS_FROM(60),
      lowMs: WEEKS_FROM(90),
      gain: { value: 0.03, low: 0.01, high: 0.05 },
    })
    const dated = runOf(card, years(episode('slip-back', 62, 120)))
    expect(dated.onsetMs).toBe(WEEKS_FROM(62))
    expect(dated.lowMs).toBe(WEEKS_FROM(90))
  })

  it('moves a low that falls past the slip the look-back names to the middle of that slip', () => {
    // The monitor kept one episode open through two falls and put its low in the later one, a year on.
    const card = status('back', {
      onsetMs: WEEKS_FROM(64),
      lowMs: WEEKS_FROM(160),
      gain: { value: 0.03, low: 0.01, high: 0.05 },
    })
    const dated = runOf(card, years(episode('slip-partly-back', 66, 100, -0.08)))
    expect(dated.onsetMs).toBe(WEEKS_FROM(66))
    expect(dated.lowMs).toBe(WEEKS_FROM(83))
  })

  it('puts the low in the deepest slip from the onset on, and an open slip runs to the date of the card', () => {
    const card = status('recovering', {
      onsetMs: WEEKS_FROM(60),
      lowMs: WEEKS_FROM(20),
      gain: { value: 0.03, low: 0.01, high: 0.05 },
    })
    const dated = runOf(
      card,
      years(
        episode('slip-back', 61, 90, -0.05),
        episode('slip-open', 120, null, -0.09),
        // Before the card's episode began: not its.
        episode('slip-back', 10, 30, -0.2),
      ),
    )
    expect(dated.lowMs).toBe((WEEKS_FROM(120) + WEEKS_FROM(200)) / 2)
  })

  it('names a rise by the start of the rise the look-back lists', () => {
    const dated = runOf(
      status('improved', { onsetMs: WEEKS_FROM(80) }),
      years(episode('improvement', 83, 95, 0.06), episode('slip-back', 30, 50)),
    )
    expect(dated.onsetMs).toBe(WEEKS_FROM(83))
    expect(dated.lowMs).toBeNull()
  })

  it('leaves the card alone when the look-back lists no episode that begins near its onset, or says nothing', () => {
    const card = status('slipping', { onsetMs: WEEKS_FROM(120) })
    const far = years(episode('slip-back', 20, 40))
    expect(runOf(card, far)).toBe(card)
    expect(runOf(status('holding', {}), far).onsetMs).toBeNull()
    const cardsBySport = cards(card)
    expect(datedByLookBack(cardsBySport, NO_LOOKBACK, NO_RUNS)).toBe(cardsBySport)
    expect(datedByLookBack(cardsBySport, lookBackWith(years()), NO_RUNS)).toBe(cardsBySport)
  })

  it('counts the runs the level before is read from over the weeks before the new onset', () => {
    const weeks = FITNESS.monitor.onsetBaseWeeks
    // One steady run a week for 62 weeks. The card counted the weeks before its own onset, week 60.
    const runs: CardRuns = {
      run: {
        runs: Array.from({ length: 62 }, (_, i) => ({ id: `r${i}`, t: i * 7 + 3, x: 0 })),
      },
      ride: { runs: [] },
    }
    const inWeeksBefore = (week: number) =>
      runs.run.runs.filter((r) => r.t >= (week - weeks) * 7 && r.t < week * 7).length
    const card = status('slipping', {
      onsetMs: WEEKS_FROM(60),
      now: 3.2,
      before: 3.4,
      change: { value: -0.06, low: -0.09, high: -0.03 },
      within: 0.07,
      evidence: {
        recent: { fromMs: WEEKS_FROM(70), toMs: WEEKS_FROM(72), runs: 6, weeks: 3, ids: [] },
        baseline: { fromMs: WEEKS_FROM(28), toMs: WEEKS_FROM(60), runs: inWeeksBefore(60), weeks },
        method: noFitness('run').evidence?.method ?? {
          tier: 'steady-pace',
          gradePassThrough: null,
          speedPerBpm: 0,
          fitted: 0,
          seasonal: null,
        },
      },
    })
    expect(fitnessFindingHeadline(card)).toContain(`before ${formatDay(WEEKS_FROM(60))}`)
    // The look-back starts the slip at week 66, six weeks on: the weeks before it hold fewer of the runs.
    const dated = runOf(card, years(episode('slip-open', 66, null)), runs)
    expect(dated.onsetMs).toBe(WEEKS_FROM(66))
    expect(inWeeksBefore(66)).toBeLessThan(inWeeksBefore(60))
    expect(dated.evidence!.baseline).toMatchObject({ runs: inWeeksBefore(66) })
    expect(dated.evidence!.baseline!.toMs).toBeGreaterThan(card.evidence!.baseline!.toMs)
    expect(dated.evidence!.recent).toBe(card.evidence!.recent)
    // The finding names the day the level before ended, which moved with the onset.
    expect(fitnessFindingHeadline(dated)).toContain(`before ${formatDay(WEEKS_FROM(66))}`)
    expect(fitnessFindingHeadline(dated)).not.toBe(fitnessFindingHeadline(card))
    // A status whose onset does not move keeps the count it had.
    expect(runOf(card, years(episode('slip-open', 60, null)), runs)).toBe(card)
  })

  it('gives the same object for the same statuses and look-back', () => {
    const cardsBySport = cards(status('slipping', { onsetMs: WEEKS_FROM(60) }))
    const look = lookBackWith(years(episode('slip-open', 62, null)))
    const dated = datedByLookBack(cardsBySport, look, NO_RUNS)
    expect(dated).not.toBe(cardsBySport)
    expect(datedByLookBack(cardsBySport, look, NO_RUNS)).toBe(dated)
    expect(dated.ride).toBe(cardsBySport.ride)
  })
})

describe('the card and the look-back on a library that dipped and came back', () => {
  // A fall at week 90 and a return at week 150 in a noisy library, told by the card and by the look-back from the same runs.
  const lib = plantedLibrary({
    seed: 11,
    weeks: 240,
    perWeek: 3,
    noise: 0.025,
    noiseModel: { autocorrelation: 0.9, heavyTails: true },
    effects: [
      { type: 'efficiency-shift', atWeek: 90, size: -0.1 },
      { type: 'efficiency-shift', atWeek: 150, size: 0.1 / 0.9 },
    ],
  })
  const settings = { massKg: 70, bikeMassKg: 9 }
  const month = (ms: number) => new Date(ms).toISOString().slice(0, 7)

  it('names the month the look-back starts the slip in, and puts the low inside a slip it lists', () => {
    const marks = [186, 192, 198].map((week) => lib.firstMs + week * WEEK)
    const months = marks.map((asOfMs) => {
      const digests = lib.digests.filter((d) => d.startMs <= asOfMs)
      const raw = fitnessStatuses(digests, NONE)
      const look = lookBackOf(digests, settings, NONE)
      const card = datedByLookBack(raw, look, fitnessHistories(digests, NONE)).run
      const listed = look.sports.run.fitness
      expect(listed.kind).toBe('ok')
      expect(card.state).toBe('recovering')
      const slips = (listed as HindsightFitness).episodes.filter((e) => e.kind.startsWith('slip'))
      const began = slips.find((e) => Math.abs(e.fromMs - card.onsetMs!) < 14 * WEEK)!
      expect(month(card.onsetMs!)).toBe(month(began.fromMs))
      expect(
        slips.some((e) => card.lowMs! >= e.fromMs && card.lowMs! <= (e.toMs ?? card.asOfMs)),
      ).toBe(true)
      // The runs the level before is counted over are the weeks before the onset it names.
      const onsetDay = (card.onsetMs! - WEEK_ORIGIN_MS) / DAY_MS
      const weeks = FITNESS.monitor.onsetBaseWeeks
      const history = fitnessHistories(digests, NONE).run.runs
      const counted = history.filter((r) => r.t >= onsetDay - weeks * 7 && r.t < onsetDay).length
      expect(card.evidence!.baseline!.runs).toBe(counted)
      return [month(raw.run.onsetMs!), month(card.onsetMs!)]
    })
    // The card's own onset was in the month after the look-back's, at each of the three marks.
    expect(months.every(([own, dated]) => own !== dated)).toBe(true)
  })
})
