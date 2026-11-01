import { DAY_MS } from '../constants'
import type { FitnessBySport, FitnessState, FitnessStatus } from '../fitness/types'
import { LOOKBACK_SPORTS } from './compute'
import type { LookBack } from './compute'
import { LOOKBACK } from './params'
import type { EpisodeKind, HindsightEpisode, HindsightFitness, SportYears } from './types'

const WEEK_MS = 7 * DAY_MS

/** The episodes a card state is about: a slip and what came of it, or a rise. */
const SLIPS: ReadonlySet<EpisodeKind> = new Set(['slip-back', 'slip-partly-back', 'slip-open'])
const RISES: ReadonlySet<EpisodeKind> = new Set(['improvement'])
const KINDS: Partial<Record<FitnessState, ReadonlySet<EpisodeKind>>> = {
  slipping: SLIPS,
  'holding-below': SLIPS,
  recovering: SLIPS,
  back: SLIPS,
  improving: RISES,
  improved: RISES,
}

/** The dates a status names its episode by. */
interface Dates {
  onsetMs: number
  lowMs: number | null
}

/**
 * The dates the fitness card names its episode by, set to the episode the look-back names.
 *
 * The card follows one episode of the monitor from the week a change is declared to the week it closes. It dates the
 * change (`onsetMs`) from the runs up to then and its low (`lowMs`) as the middle of the lowest 20-week level of the
 * whole episode. The look-back cuts the same runs into plateaus once it can see both sides of every change, so it may
 * split a long episode into two slips, and the card's low can fall past the end of the slip the look-back names, in the
 * next year. Both are told of one athlete, so the card takes the look-back's dates where the look-back lists the
 * episode: its onset becomes the start of the slip (or rise) that begins within `fallLeadWeeks` of it, and its low is
 * kept when it lies inside the deepest slip from there on and moved to the middle of that slip when it does not. An
 * episode the look-back does not list (it is inside the horizon, or too small to be listed) keeps the card's dates.
 */
function datesOf(status: FitnessStatus, years: HindsightFitness): Dates | null {
  const kinds = KINDS[status.state]
  const onset = status.onsetMs
  if (kinds === undefined || onset === null) return null
  const reach = LOOKBACK.card.fallLeadWeeks * WEEK_MS
  const listed = years.episodes.filter(
    (e) => kinds.has(e.kind) && (e.toMs ?? Infinity) >= onset - reach,
  )
  const gap = (e: HindsightEpisode) => Math.abs(e.fromMs - onset)
  const begins = listed.filter((e) => gap(e) <= reach).sort((a, b) => gap(a) - gap(b))[0]
  const from = begins?.fromMs ?? onset
  if (status.lowMs === null) return { onsetMs: from, lowMs: null }
  // The deepest slip from the start of the card's episode: the largest fall against the level before it.
  const deepest = listed
    .filter((e) => e.fromMs >= from)
    .sort((a, b) => a.change.value - b.change.value)[0]
  if (deepest === undefined) return { onsetMs: from, lowMs: status.lowMs }
  const end = deepest.toMs ?? status.asOfMs
  const inside = status.lowMs >= deepest.fromMs && status.lowMs <= end
  return { onsetMs: from, lowMs: inside ? status.lowMs : (deepest.fromMs + end) / 2 }
}

/** A status with the dates of the look-back's episode, or itself when there are none to take. */
function dated(status: FitnessStatus, years: SportYears): FitnessStatus {
  if (years.kind !== 'ok') return status
  const dates = datesOf(status, years)
  if (dates === null || (dates.onsetMs === status.onsetMs && dates.lowMs === status.lowMs)) {
    return status
  }
  return { ...status, onsetMs: dates.onsetMs, lowMs: dates.lowMs }
}

const remembered = new WeakMap<FitnessBySport, WeakMap<LookBack, FitnessBySport>>()

/**
 * Each sport's fitness status with the dates of the episode set to the look-back's (see `datesOf`), so the card, the
 * findings of a look at the years and the History chart name one episode. The same statuses and look-back give the same
 * object back, and a library whose dates agree already gets the statuses it was given.
 */
export function datedByLookBack(statuses: FitnessBySport, lookBack: LookBack): FitnessBySport {
  const known = remembered.get(statuses)?.get(lookBack)
  if (known !== undefined) return known
  const next = Object.fromEntries(
    LOOKBACK_SPORTS.map((s) => [s, dated(statuses[s], lookBack.sports[s].fitness)]),
  ) as FitnessBySport
  const answer = LOOKBACK_SPORTS.every((s) => next[s] === statuses[s]) ? statuses : next
  const inner = remembered.get(statuses) ?? new WeakMap<LookBack, FitnessBySport>()
  inner.set(lookBack, answer)
  remembered.set(statuses, inner)
  return answer
}
