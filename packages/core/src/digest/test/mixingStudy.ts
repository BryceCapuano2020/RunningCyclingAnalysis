import { DAY_MS } from '../../constants'
import { runReadings } from '../../fitness/runReadings'
import { withRevisionTable } from '../revisions'
import type { RevisionDeclaration } from '../revisions'
import { AnalysisSession } from '../../session'
import type { SessionState } from '../../sessionState'
import type { ActivityDigest, AthleteSettings, Sport } from '../../types'
import { BOUNDS, outputsOf } from './mixingOutputs'
import type { MixingOutputs } from './mixingOutputs'

/**
 * The mixing study of D12 section 1.8: a library whose newest or oldest k% of digests are on revision 7 and the rest on
 * revision 6 (the shape a rebuild leaves, newest first, and the shape of an account without originals), compared on
 * every output with the same library on revision 7 alone.
 */

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }

const exclusive = (revision: number): RevisionDeclaration => ({
  revision,
  kind: 'exclusive',
  adds: [],
  changes: [],
  affects: [],
})

/** Revision 7 made mixable with nothing held back and nothing suppressed, so a mixture is read as a whole library. */
export const OPEN_TABLE: readonly RevisionDeclaration[] = [
  ...[1, 2, 3, 4, 5, 6].map(exclusive),
  {
    revision: 7,
    kind: 'mixable',
    adds: ['temperature', 'athleteType', 'localDayShift'],
    changes: [],
    affects: [],
  },
]

export const KS = [10, 25, 50, 75, 90] as const
export type Side = 'newest' | 'oldest'
export const SIDES: readonly Side[] = ['newest', 'oldest']

/** The two digests of every activity, by id, oldest first, in the order of the library. */
export interface Pairs {
  six: ActivityDigest[]
  seven: ActivityDigest[]
}

/** The library with its newest (or oldest) `k` percent on revision 7 and the rest on 6. */
export function mixed({ six, seven }: Pairs, side: Side, k: number): ActivityDigest[] {
  const count = Math.round((six.length * k) / 100)
  return six.map((digest, i) => {
    const onSeven = side === 'newest' ? i >= six.length - count : i < count
    return onSeven ? seven[i]! : digest
  })
}

/** The state a session gives for these digests under the open table, over the default period. */
export function stateOf(digests: readonly ActivityDigest[]): SessionState {
  return withRevisionTable(OPEN_TABLE, () => {
    const session = new AnalysisSession()
    // Today is two days after the newest activity, whichever day the study runs: the fitness status reads the clock.
    const newest = Math.max(...digests.map((digest) => digest.startMs))
    session.clock = () => newest + 2 * DAY_MS
    session.loadDigests([...digests], SETTINGS)
    return session.setRange('default', SETTINGS)
  })
}

const relative = (a: number, b: number): number =>
  Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? Math.abs(a / b - 1) : 0

function maxRelative(a: readonly number[], b: readonly number[]): number {
  let worst = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++)
    worst = Math.max(worst, relative(a[i]!, b[i]!))
  return worst
}

/** How far a mixture's outputs are from the all-revision-7 library's. */
export interface Distance {
  /** Largest relative difference of any best-effort value, both sports. */
  best: number
  /** Largest relative difference of any weekly best 20 minutes. */
  trend: number
  /** Largest difference of a reference maximum heart rate, bpm. */
  referenceHrBpm: number
  /** Largest relative difference of a threshold. */
  threshold: number
  /** Relative difference of the run/ride lean at 20 minutes. */
  lean: number
  /** Largest difference of the fitness output at the reference heart rate, now or in the earlier level it is read against, in log units, both sports. */
  fitness: number
  /** Whether the fitness state (slipping, holding...) is the same for both sports. */
  fitnessState: boolean
  /** Change verdicts compared. */
  verdicts: { total: number; differ: number; towardNone: number; awayFromNone: number }
  /** Record keys compared and the share held by a different activity. */
  holders: { total: number; differ: number }
}

const isNone = (verdict: string): boolean =>
  verdict.endsWith(':none') || verdict.endsWith(':untested')

export function distance(mix: MixingOutputs, base: MixingOutputs): Distance {
  const sports: Sport[] = ['run', 'ride']
  const diff = (
    pick: (o: MixingOutputs) => (number | null)[],
    gap: (a: number, b: number) => number,
  ): number => {
    const a = pick(mix)
    const b = pick(base)
    let worst = 0
    for (let i = 0; i < a.length; i++) {
      if (a[i] != null && b[i] != null) worst = Math.max(worst, gap(a[i]!, b[i]!))
    }
    return worst
  }
  let differ = 0
  let towardNone = 0
  let awayFromNone = 0
  const total = Math.max(mix.verdicts.length, base.verdicts.length)
  for (let i = 0; i < total; i++) {
    const m = mix.verdicts[i] ?? ''
    const b = base.verdicts[i] ?? ''
    if (m === b) continue
    differ++
    if (isNone(m) && !isNone(b)) towardNone++
    else if (!isNone(m)) awayFromNone++
  }
  const baseHolders = new Set(base.holders)
  const mixHolders = new Set(mix.holders)
  const keys = new Set([...baseHolders, ...mixHolders])
  let heldDifferently = 0
  for (const key of keys) if (baseHolders.has(key) !== mixHolders.has(key)) heldDifferently++
  return {
    best: Math.max(...sports.map((s) => maxRelative(mix.bests[s], base.bests[s]))),
    trend: Math.max(...sports.map((s) => maxRelative(mix.trend[s], base.trend[s]))),
    referenceHrBpm: diff(
      (o) => sports.map((s) => o.referenceHr[s]),
      (a, b) => Math.abs(a - b),
    ),
    threshold: diff((o) => sports.map((s) => o.threshold[s]), relative),
    lean: mix.lean !== null && base.lean !== null ? relative(mix.lean, base.lean) : 0,
    fitness: Math.max(
      ...(['now', 'before'] as const).map((which) =>
        diff(
          (o) => sports.map((s) => o.fitness[s][which]),
          (a, b) => (a > 0 && b > 0 ? Math.abs(Math.log(a / b)) : 0),
        ),
      ),
    ),
    fitnessState: sports.every((s) => mix.fitness[s].state === base.fitness[s].state),
    verdicts: { total, differ, towardNone, awayFromNone },
    holders: { total: keys.size, differ: heldDifferently },
  }
}

/** The mean grade credit of the kilometres a run offers the fitness unit, or null when it offers none. */
function meanCredit(digest: ActivityDigest, unit: 'loose' | 'strict'): number | null {
  const km = runReadings(digest, 'run')?.[unit] ?? []
  return km.length === 0 ? null : km.reduce((sum, k) => sum + k.credit, 0) / km.length
}

function creditOffsetOf({ six, seven }: Pairs, unit: 'loose' | 'strict'): number {
  let worst = 0
  six.forEach((digest, i) => {
    const before = meanCredit(digest, unit)
    const after = meanCredit(seven[i]!, unit)
    if (before !== null && after !== null) worst = Math.max(worst, Math.abs(after - before))
  })
  return worst
}

/** What the study found for one library: the worst distance over every partition, and each partition's own. */
export interface LibraryResult {
  name: string
  runs: number
  rides: number
  /**
   * The largest change of a run's grade credit between the two revisions, as the mean over the kilometres the steady-pace
   * unit reads (`creditOffset`) and over those the strict unit reads (`creditOffsetStrict`). The fitness value moves by
   * the fitted share of it (at most the whole of it): the strict unit, which a library of under 300 kilometres uses,
   * takes the whole credit, so `creditOffsetStrict` bounds what such a library sees.
   */
  creditOffset: number
  creditOffsetStrict: number
  cases: { side: Side; k: number; distance: Distance }[]
}

export function studyLibrary(name: string, pairs: Pairs): LibraryResult {
  const base = outputsOf(stateOf(pairs.seven))
  const cases = SIDES.flatMap((side) =>
    KS.map((k) => ({
      side,
      k,
      distance: distance(outputsOf(stateOf(mixed(pairs, side, k))), base),
    })),
  )
  return {
    name,
    runs: pairs.six.filter((d) => d.sport === 'run').length,
    rides: pairs.six.filter((d) => d.sport === 'ride').length,
    creditOffset: creditOffsetOf(pairs, 'loose'),
    creditOffsetStrict: creditOffsetOf(pairs, 'strict'),
    cases,
  }
}

/** The consumer groups the rule of 1.8 judges, each with whether the whole study kept it inside its bound. */
export interface Findings {
  best: number
  trend: number
  referenceHrBpm: number
  threshold: number
  lean: number
  fitness: number
  fitnessStateChanges: number
  creditOffset: number
  creditOffsetStrict: number
  verdictAgreement: number
  verdictsAwayFromNone: number
  holdersAgreement: number
  within: Record<'combine' | 'trend' | 'zones' | 'fitness' | 'change' | 'records', boolean>
}

/** A verdict must agree with the all-revision-7 library's for at least this share of calls. */
export const VERDICT_AGREEMENT = 0.99

export function findingsOf(results: readonly LibraryResult[]): Findings {
  const all = results.flatMap((result) => result.cases.map((c) => c.distance))
  const worst = (pick: (d: Distance) => number): number => Math.max(0, ...all.map(pick))
  const verdictTotal = all.reduce((sum, d) => sum + d.verdicts.total, 0)
  const verdictDiffer = all.reduce((sum, d) => sum + d.verdicts.differ, 0)
  const holderTotal = all.reduce((sum, d) => sum + d.holders.total, 0)
  const holderDiffer = all.reduce((sum, d) => sum + d.holders.differ, 0)
  const best = worst((d) => d.best)
  const trend = worst((d) => d.trend)
  const referenceHrBpm = worst((d) => d.referenceHrBpm)
  const threshold = worst((d) => d.threshold)
  const lean = worst((d) => d.lean)
  const fitness = worst((d) => d.fitness)
  const verdictAgreement = verdictTotal === 0 ? 1 : 1 - verdictDiffer / verdictTotal
  const verdictsAwayFromNone = all.reduce((sum, d) => sum + d.verdicts.awayFromNone, 0)
  const holdersAgreement = holderTotal === 0 ? 1 : 1 - holderDiffer / holderTotal
  return {
    best,
    trend,
    referenceHrBpm,
    threshold,
    lean,
    fitness,
    fitnessStateChanges: all.filter((d) => !d.fitnessState).length,
    creditOffset: Math.max(0, ...results.map((result) => result.creditOffset)),
    creditOffsetStrict: Math.max(0, ...results.map((result) => result.creditOffsetStrict)),
    verdictAgreement,
    verdictsAwayFromNone,
    holdersAgreement,
    within: {
      combine: best <= BOUNDS.best && lean <= BOUNDS.best && threshold <= BOUNDS.best,
      trend: trend <= BOUNDS.best,
      zones: referenceHrBpm <= BOUNDS.zoneBpm,
      fitness: fitness <= BOUNDS.fitness && all.every((d) => d.fitnessState),
      change: verdictAgreement >= VERDICT_AGREEMENT && verdictsAwayFromNone === 0,
      records: holdersAgreement >= VERDICT_AGREEMENT,
    },
  }
}

/** The rule of 1.8: every output within bound is `mixable`; fitness alone failing is `mixable` holding fitness back. */
export function decide(findings: Findings): { kind: 'mixable' | 'exclusive'; holdsBack: string[] } {
  const failing = Object.entries(findings.within)
    .filter(([, ok]) => !ok)
    .map(([consumer]) => consumer)
  if (failing.length === 0) return { kind: 'mixable', holdsBack: [] }
  if (failing.length === 1 && failing[0] === 'fitness')
    return { kind: 'mixable', holdsBack: ['fitness'] }
  return { kind: 'exclusive', holdsBack: [] }
}
