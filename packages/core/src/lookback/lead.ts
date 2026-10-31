import { LOOKBACK } from './params'
import type { FitnessState } from '../fitness/types'
import type { Sport } from '../types'
import type { LookBack } from './compute'
import type { EffortMilestones, HindsightEpisode, HindsightFitness, QuietStretch } from './types'

const YEAR_MS = 365.25 * 86_400_000

/**
 * Whether an episode is strong enough to be the lead of the look-back (never in a library under two years): a change of `lead.delta` or more, `lead.z` standard
 * errors against the floor, ended or begun within the last `lead.years` before the horizon. Being listed needs less
 * (the monitor's own bar); a lead is what the page opens on, so it is held to more. A slip still open at the horizon is
 * judged by when it began.
 */
export function meetsLeadBar(episode: HindsightEpisode, years: HindsightFitness): boolean {
  // Under two years no season can be told from change, so nothing leads.
  if (years.toMs - years.fromMs < LOOKBACK.list.shortWeeks * 7 * 86_400_000) return false
  const size = Math.abs(Math.log1p(episode.change.value))
  const when = episode.toMs ?? episode.fromMs
  return (
    size >= LOOKBACK.lead.delta &&
    Math.abs(episode.z) >= LOOKBACK.lead.z &&
    years.toMs - when <= LOOKBACK.lead.years * YEAR_MS
  )
}

/**
 * What the sport's live fitness status allows the look-back to say about the level now. The look-back sees only through
 * the horizon, so it says nothing that a card showing a slip, a plateau under the old level, a recovery or a rise could
 * contradict: a quiet stretch, a rise that "held", a level "back". It may always say what happened and when.
 */
export type LiveState = FitnessState | null

// Named as text so the set also holds `improved` where the state exists.
const HOLDS: ReadonlySet<string | null> = new Set<string | null>([
  null,
  'holding',
  'back',
  'improved',
  'not-enough-evidence',
])

/** Whether the look-back may say a level held, or was steady, through the horizon. */
export const mayStateHeld = (live: LiveState): boolean => HOLDS.has(live)

export type Lead =
  /** An episode, and whether the level may be said to have held after it. */
  | { kind: 'episode'; sport: Sport; episode: HindsightEpisode; held: boolean }
  /** A quiet stretch that reaches the horizon. */
  | { kind: 'quiet'; sport: Sport; stretch: QuietStretch }
  /** The best that has stood longest. */
  | { kind: 'best'; sport: Sport; best: EffortMilestones }

const YEARS_MS = 365.25 * 86_400_000

/**
 * What the look-back opens on, or null when nothing earns it: (1) the most recent episode that meets the lead bar (the
 * sport with more steady runs on a tie), (2) a quiet stretch of a year or more that reaches the horizon, only when the
 * sport's live status allows it, (3) the best that has stood longest. A sport that is too short leads with nothing,
 * and a library under two years has no episode or quiet lead.
 */
export function leadOf(lookBack: LookBack, live: Record<Sport, LiveState>): Lead | null {
  const sports = (['run', 'ride'] as const).map((s) => lookBack.sports[s])
  const told = sports.flatMap((s) => (s.fitness.kind === 'ok' ? [{ s, years: s.fitness }] : []))
  const episodes = told.flatMap(({ s, years }) =>
    years.episodes
      .filter((e) => meetsLeadBar(e, years))
      .map((episode) => ({ sport: s.sport, episode, runs: years.runs })),
  )
  episodes.sort(
    (a, b) =>
      (b.episode.toMs ?? b.episode.fromMs) - (a.episode.toMs ?? a.episode.fromMs) ||
      b.runs - a.runs,
  )
  const first = episodes[0]
  if (first !== undefined) {
    const years = lookBack.sports[first.sport].fitness as HindsightFitness
    const after = years.levels.at(-1)!
    // "Held" is said of a rise that the last plateau still sits at, when the live status allows it.
    const held =
      mayStateHeld(live[first.sport]) &&
      first.episode.kind === 'improvement' &&
      (first.episode.toMs ?? 0) >= after.fromMs - 1
    return { kind: 'episode', sport: first.sport, episode: first.episode, held }
  }
  const quiet = told
    .filter(
      ({ s, years }) =>
        mayStateHeld(live[s.sport]) &&
        years.toMs - years.fromMs >= LOOKBACK.list.shortWeeks * 7 * 86_400_000,
    )
    .flatMap(({ s, years }) =>
      years.quiet
        .filter(
          (q) => q.toMs - q.fromMs >= YEARS_MS && lookBack.horizonMs - q.toMs <= 14 * 86_400_000,
        )
        .map((stretch) => ({ sport: s.sport, stretch })),
    )
    .sort((a, b) => b.stretch.toMs - b.stretch.fromMs - (a.stretch.toMs - a.stretch.fromMs))
  if (quiet[0] !== undefined) return { kind: 'quiet', ...quiet[0] }
  const bests = sports
    .flatMap((s) => s.milestones.map((best) => ({ sport: s.sport, best })))
    .sort((a, b) => a.best.best.atMs - b.best.best.atMs)
  return bests[0] === undefined ? null : { kind: 'best', ...bests[0] }
}
