import { expect } from 'vitest'
import { DAY_MS } from '../../constants'
import { FINDINGS } from '../constants'
import { inputAt, weeklyMarks } from '../input'
import { registryOf } from '../registry'
import type { Registry } from '../registry'
import { replay } from '../replay'
import type { MarkReport, Replay } from '../replay'
import { materiallyChanged, signOf } from '../score'
import type { Detector, Finding, FindingInput, Ref } from '../types'
import { plantedLibrary } from './plantedLibrary'
import type { PlantedLibrary, PlantedSpec, Truth } from './plantedLibrary'

const WEEK_MS = 7 * DAY_MS

/** The input at each mark of each library, kept so that replaying a library again does not work its tables out again. */
const INPUTS = new WeakMap<PlantedLibrary, Map<number, FindingInput>>()

function cachedInput(library: PlantedLibrary, asOfMs: number): FindingInput {
  const marks = INPUTS.get(library) ?? new Map<number, FindingInput>()
  INPUTS.set(library, marks)
  const known = marks.get(asOfMs)
  if (known !== undefined) return known
  const made = inputAt(library, asOfMs)
  marks.set(asOfMs, made)
  return made
}

/**
 * Replays a registry over a library at weekly marks, as the app would see it opening every week, and
 * returns what it spoke. `fromMs` and `toMs` narrow the marks; the first mark has no one before it, so
 * nothing is spoken there. The tables of each mark are kept per library, so replaying the same library
 * with another registry costs the detectors only.
 */
export function replayRegistry(
  registry: Registry,
  library: PlantedLibrary,
  range: { fromMs?: number; toMs?: number } = {},
): Replay {
  const marks = weeklyMarks(library.digests, range)
  return replay(library, marks, { registry, inputAt: (asOfMs) => cachedInput(library, asOfMs) })
}

/** The same for one detector alone. */
export function replayDetector(
  detector: Detector,
  library: PlantedLibrary,
  range: { fromMs?: number; toMs?: number } = {},
): Replay {
  return replayRegistry(registryOf([detector]), library, range)
}

/** A finding the first time it is spoken in a run of evaluations: the number the budget is counted in. */
export interface Episode {
  finding: Finding
  startMs: number
}

/**
 * What a user opening the app every week would be shown as new: a finding when it starts to be spoken,
 * counted once for the run of evaluations it is spoken in, and again after a gap only if it has moved
 * materially from the effect they were shown (50%, or the other sign), which is when the ledger lets a
 * finding show again. A finding that goes on, or flickers at the edge and returns the same, is one.
 */
export function episodesOf(marks: readonly MarkReport[]): Episode[] {
  const episodes: Episode[] = []
  const lastShown = new Map<string, number>()
  let before = new Map<string, number>()
  for (const mark of marks) {
    const now = new Map<string, number>()
    for (const finding of mark.spoken) {
      now.set(finding.id, signOf(finding.effect))
      if (before.get(finding.id) === signOf(finding.effect)) continue
      const shown = lastShown.get(finding.id)
      if (shown !== undefined && !materiallyChanged(shown, finding.effect)) continue
      lastShown.set(finding.id, finding.effect)
      episodes.push({ finding, startMs: mark.asOfMs })
    }
    before = now
  }
  return episodes
}

/** The share of marks at which no finding began to be spoken: what a user opening the app each week would call quiet. */
export function quietShare(marks: readonly MarkReport[]): number {
  if (marks.length === 0) return 1
  const starts = new Set(episodesOf(marks).map((e) => e.startMs))
  return marks.filter((m) => !starts.has(m.asOfMs)).length / marks.length
}

/** Fails when a detector made copy or numbers that the engine dropped: that is a bug, not a quiet week. */
function expectNoDefects(marks: readonly MarkReport[]): void {
  const defects = marks.flatMap((m) =>
    m.rejected.filter((r) => r.reason === 'copy' || r.reason === 'invalid'),
  )
  expect(defects).toEqual([])
}

export interface SilenceBudget {
  /** The most findings per athlete-year (a finding spoken over a run of weeks counts once). */
  perAthleteYear: number
  /**
   * The athlete-years the libraries must add up to. A rate of 0.05 means nothing measured over three
   * years, so a sweep too small for its budget fails before it can pass: 100 years can show a rate of
   * 0.05 to be about 5 findings.
   */
  minAthleteYears: number
}

export interface SilenceReport {
  episodes: Episode[]
  athleteYears: number
  /** Episodes per athlete-year. */
  rate: number
}

function sweep(
  registry: Registry,
  libraries: readonly PlantedLibrary[],
  minHistoryWeeks: number,
): SilenceReport {
  const episodes: Episode[] = []
  let weeks = 0
  for (const library of libraries) {
    // The weeks before the minimum history cannot speak, and the mark before the first one is needed.
    const fromMs = library.firstMs + (minHistoryWeeks - 1) * WEEK_MS
    const result = replayRegistry(registry, library, { fromMs })
    expectNoDefects(result.marks)
    episodes.push(...episodesOf(result.marks))
    weeks += library.spec.weeks
  }
  const athleteYears = weeks / 52
  return { episodes, athleteYears, rate: episodes.length / athleteYears }
}

function expectWithin(report: SilenceReport, budget: SilenceBudget): SilenceReport {
  expect(
    report.athleteYears,
    `${report.athleteYears.toFixed(1)} athlete-years tested, ${budget.minAthleteYears} stated`,
  ).toBeGreaterThanOrEqual(budget.minAthleteYears)
  expect(
    report.rate,
    `${report.episodes.length} findings in ${report.athleteYears.toFixed(1)} athlete-years: ${report.episodes
      .slice(0, 5)
      .map((e) => e.finding.headline)
      .join(' | ')}`,
  ).toBeLessThanOrEqual(budget.perAthleteYear)
  return report
}

/**
 * Replays the detector over each library (nothing in any of them changes) and fails when it speaks more
 * than the budget allows, or when the libraries are too few to show it: the design holds each detector
 * to one finding in 20 athlete-years (0.05). Every weekly mark from the detector's minimum history to
 * the last is evaluated, so a finding that comes and goes counts each time it returns.
 */
export function expectSilence(
  detector: Detector,
  libraries: readonly PlantedLibrary[],
  budget: SilenceBudget,
): SilenceReport {
  return expectWithin(sweep(registryOf([detector]), libraries, detector.minHistoryWeeks), budget)
}

/** The design's limit for the whole engine: half a finding in an athlete-year, across every detector. */
export const REGISTRY_BUDGET_PER_ATHLETE_YEAR = FINDINGS.familyBudgetPerYear

/**
 * The same for a whole registry: all its detectors together may speak at most `perAthleteYear` findings
 * (REGISTRY_BUDGET_PER_ATHLETE_YEAR by default) in a year of an athlete in whom nothing changes.
 */
export function expectRegistrySilence(
  registry: Registry,
  libraries: readonly PlantedLibrary[],
  budget: Partial<SilenceBudget> & Pick<SilenceBudget, 'minAthleteYears'>,
): SilenceReport {
  const detectors = [...registry.run, ...registry.ride]
  const minHistory = Math.min(...detectors.map((d) => d.minHistoryWeeks), 52)
  return expectWithin(sweep(registry, libraries, minHistory), {
    perAthleteYear: REGISTRY_BUDGET_PER_ATHLETE_YEAR,
    ...budget,
  })
}

export interface NuisanceBudget extends SilenceBudget {
  /** The most confidence a finding may have when it speaks under a nuisance; 0.85 by default. */
  maxConfidence?: number
}

/**
 * For libraries where something other than the athlete changes (a strap, a meter, zones, spikes,
 * duplicates, a season, missing heart rate): the detector is silent, or what it says carries no likely
 * explanation and confidence under the cap, and it is within the budget either way. The design asks of a
 * nuisance that the finding is silent or loses its cause.
 */
export function expectToleratesNuisance(
  detector: Detector,
  libraries: readonly PlantedLibrary[],
  budget: NuisanceBudget,
): SilenceReport {
  const report = sweep(registryOf([detector]), libraries, detector.minHistoryWeeks)
  const maxConfidence = budget.maxConfidence ?? 0.85
  for (const { finding } of report.episodes) {
    expect(finding.likelyCause, `explains "${finding.headline}" under a nuisance`).toBeUndefined()
    expect(
      finding.confidence,
      `"${finding.headline}" is too sure under a nuisance`,
    ).toBeLessThanOrEqual(maxConfidence)
  }
  return expectWithin(report, budget)
}

/** Whether a finding's evidence reaches what was planted: one of its activities, or a week or stretch from the onset on. */
export function evidenceReaches(evidence: readonly Ref[], truth: Truth): boolean {
  const planted = new Set(truth.plantedIds)
  return evidence.some((ref) => {
    if (ref.type === 'activity') return planted.has(ref.id)
    if (ref.type === 'week') return ref.endMs >= truth.onsetMs
    return ref.span.toMs >= truth.onsetMs
  })
}

export interface FindsOptions {
  /** How many seeds to plant it with: 1 to this. */
  seeds: number
  /** The share of seeds it must be found in; 0.9 by default. */
  minRate?: number
  /** The weekly evaluations, from the one that ends the week the effect begins, within which it must be spoken. */
  lagWeeks: number
  /** The sign its effect must have. */
  sign: -1 | 1
  /**
   * How big its effect must be: within `relativeTolerance` of `expected`, which is the planted size as
   * the library realised it (`truth.realised`) unless the detector's unit differs, when `expected`
   * converts it (a heart rate at a pace is bpmForEfficiency of the efficiency planted).
   */
  size: { relativeTolerance: number; expected?: (truth: Truth) => number }
  /** Which planted effect is looked for; the first by default. */
  truth?: number
  /** Whether its evidence must reach the planted activities; true by default. */
  evidence?: boolean
}

export interface FindsReport {
  rate: number
  /** Seeds in which it was found in time, and those in which it was not. */
  found: number[]
  missed: number[]
  /** Seeds whose paired library, with nothing planted, made the detector speak: those do not count as found. */
  noisyNulls: number[]
}

const keyOf = (finding: Finding) => `${finding.id}|${signOf(finding.effect)}`

/**
 * Plants the effects of `planted` in a library for each seed and fails when the detector does not speak
 * of it within `lagWeeks` evaluations in at least `minRate` of them. A seed counts as found only if
 * - a finding of the detector with the right sign and size is spoken, with evidence reaching what was
 *   planted, at an evaluation from the onset to the lag;
 * - that finding (its id and sign) was not spoken before the onset; and
 * - the paired library (the same seed with nothing planted, which differs only after the onset) makes
 *   the detector speak nothing over the same evaluations.
 * So a detector that speaks all the time finds nothing. Marks start six weeks before the onset.
 */
export function expectFinds(
  detector: Detector,
  planted: Omit<PlantedSpec, 'seed'>,
  options: FindsOptions,
): FindsReport {
  const found: number[] = []
  const missed: number[] = []
  const noisyNulls: number[] = []
  for (let seed = 1; seed <= options.seeds; seed++) {
    const library = plantedLibrary({ ...planted, seed })
    const truth = library.truths[options.truth ?? 0]!
    const range = {
      fromMs: truth.onsetMs - 6 * WEEK_MS,
      toMs: truth.onsetMs + options.lagWeeks * WEEK_MS,
    }
    const result = replayDetector(detector, library, range)
    const paired = replayDetector(
      detector,
      plantedLibrary({ ...planted, seed, effects: [] }),
      range,
    )
    expectNoDefects(result.marks)
    expectNoDefects(paired.marks)
    const nullSpoke = paired.marks.some((m) => m.spoken.length > 0)
    if (nullSpoke) noisyNulls.push(seed)
    const before = new Set(
      result.marks.filter((m) => m.asOfMs < truth.onsetMs).flatMap((m) => m.spoken.map(keyOf)),
    )
    const expected = options.size.expected?.(truth) ?? truth.realised
    const hit =
      !nullSpoke &&
      result.marks.some(
        (mark) =>
          mark.asOfMs >= truth.onsetMs &&
          mark.spoken.some(
            (f) =>
              f.detector === detector.id &&
              signOf(f.effect) === options.sign &&
              !before.has(keyOf(f)) &&
              Math.abs(Math.abs(f.effect) - Math.abs(expected)) <=
                options.size.relativeTolerance * Math.abs(expected) &&
              (options.evidence === false || evidenceReaches(f.evidence, truth)),
          ),
      )
    ;(hit ? found : missed).push(seed)
  }
  const rate = found.length / options.seeds
  expect(
    rate,
    `found in seeds ${found.join(',')}, missed in ${missed.join(',')}, paired null spoke in ${noisyNulls.join(',')}`,
  ).toBeGreaterThanOrEqual(options.minRate ?? 0.9)
  return { rate, found, missed, noisyNulls }
}
