import { isBackLevel } from '../fitness/episode'
import { FITNESS } from '../fitness/params'
import { halfWidth, ranged } from '../fitness/status'
import type { Ranged } from '../fitness/types'
import type { LiveEpisode } from './live'
import { LOOKBACK } from './params'
import { coreOf, stepZ } from './segments'
import type { Level } from './segments'
import type { EpisodeKind } from './types'

/** An episode before its dates are turned into time: weeks since the origin. */
export interface WeekEpisode {
  kind: EpisodeKind
  fromWeek: number
  toWeek: number | null
  change: Ranged
  regained: Ranged | null
  remaining: Ranged | null
  z: number
  steps: number
  runs: number
}

/** A span of weeks with no run of any kind. */
export interface WeekSpan {
  fromWeek: number
  toWeek: number
}

/** A change under this (half of 0.1%) is written as 0%: formatRelative's one decimal below 10%. */
const NOTHING = 0.0005

/** The change from one level to another, with its range as the printed ranges have it. */
const changeBetween = (a: Level, b: Level): Ranged => ranged(b.m - a.m, halfWidth(a.se, b.se))

const rising = (r: Ranged) => r.low > 0
const falling = (r: Ranged) => r.high < 0

/**
 * Whether the level after a return is back: the test the live monitor holds a "back" to (`isBackLevel`). The standard
 * error is the two levels' with the model-error floor added in quadrature, as the live one adds `tau` and the
 * reference's own error to the level's.
 */
export function isBack(pre: Level, post: Level, floor: number): boolean {
  const [a, b] = [coreOf(pre), coreOf(post)]
  return isBackLevel(b.m - a.m, Math.sqrt(a.se ** 2 + b.se ** 2 + floor ** 2))
}

/**
 * Whether the fitness card reached "back" for this slip and nothing after contradicts it. The card's slip is the one
 * declared within a few weeks of the fall (it trails the fall by 3 to 9 weeks); the "back" is its own, before the
 * horizon, with no reopening; and the plateau after the return is not clearly more than `backTol` under the plateau
 * before the fall (the same one-sided bound the back test uses, pointed the other way). A residual that is really there
 * keeps the slip partly back.
 */
function cardSaidBack(
  live: readonly LiveEpisode[],
  fallWeek: number,
  returnWeek: number,
  pre: Level,
  post: Level,
  floor: number,
): boolean {
  const E = FITNESS.episode
  const [a, b] = [coreOf(pre), coreOf(post)]
  const se = Math.sqrt(a.se ** 2 + b.se ** 2 + floor ** 2)
  if (b.m - a.m + E.boundZ * se < -E.backTol) return false
  return live.some(
    (l) =>
      l.backWeek !== null &&
      !l.relapsed &&
      l.declaredWeek >= fallWeek - LOOKBACK.liveMatchWeeks &&
      l.declaredWeek <= fallWeek + 2 * LOOKBACK.liveMatchWeeks &&
      l.backWeek >= returnWeek - LOOKBACK.liveMatchWeeks,
  )
}

/** A step beside a break: the boundary is within `afterBreakWeeks` of either end of a span with no run at all. */
const besideBreak = (week: number, breaks: readonly WeekSpan[]): boolean =>
  breaks.some(
    (b) =>
      week >= b.fromWeek - LOOKBACK.afterBreakWeeks && week <= b.toWeek + LOOKBACK.afterBreakWeeks,
  )

/** A run of steps in one direction: the levels before the first and after the last, and how many steps. */
interface Move {
  from: number
  to: number
  steps: number
  afterBreak: boolean
  /** The step is at a change the card declared. */
  forced: boolean
}

/**
 * The steps between neighbouring levels that are as large as `delta` and clear of the floor, grouped into moves:
 * steps in one direction with no level between them longer than `coalesceWeeks` are one move (a slide or a build). A step
 * beside a break is a move of its own.
 */
function movesOf(levels: readonly Level[], breaks: readonly WeekSpan[], delta: number): Move[] {
  const moves: Move[] = []
  for (let i = 1; i < levels.length; i++) {
    // A step at a change the card declared is a move of its own, as small as the card's bar, and read without the weeks beside it.
    const forced = levels[i]!.forced !== undefined
    const d = forced
      ? coreOf(levels[i]!).m - coreOf(levels[i - 1]!).m
      : levels[i]!.m - levels[i - 1]!.m
    if (Math.abs(d) < (forced ? LOOKBACK.card.delta : delta)) continue
    const afterBreak = besideBreak(levels[i]!.fromWeek, breaks)
    const last = moves.at(-1)
    const between = levels[i - 1]!.toWeek - levels[i - 1]!.fromWeek
    if (
      last !== undefined &&
      !afterBreak &&
      !forced &&
      !last.afterBreak &&
      last.to === i - 1 &&
      Math.sign(levels[last.to]!.m - levels[last.from]!.m) === Math.sign(d) &&
      between <= LOOKBACK.coalesceWeeks
    ) {
      last.to = i
      last.steps++
    } else moves.push({ from: i - 1, to: i, steps: 1, afterBreak, forced })
  }
  return moves
}

/**
 * The episodes the levels hold. A fall of `delta` or more with a range below zero opens a slip; the next rise closes it
 * as `slip-back` when the level is back (isBack, or the fitness card said back for this slip and nothing contradicts it,
 * or what is missing is written as 0%), as `slip-partly-back` when it came part of the way, and a fall with
 * no rise is `slip-open`. A rise with no slip open is an `improvement`; a rise that carries the level clear above where
 * it was before the fall is a return and an improvement of the excess. A step beside a break is `after-break` and
 * ends no slip. Ranges are the printed ones; a change whose range reaches zero is not listed.
 */
export function episodesOf(
  levels: readonly Level[],
  breaks: readonly WeekSpan[],
  floor: number,
  delta: number,
  live: readonly LiveEpisode[] = [],
): WeekEpisode[] {
  const out: WeekEpisode[] = []
  const runsIn = (a: number, b: number) =>
    levels.slice(a + 1, b + 1).reduce((total, level) => total + level.n, 0)
  const episode = (
    kind: EpisodeKind,
    from: number,
    to: number,
    steps: number,
    over: Partial<WeekEpisode> = {},
  ): WeekEpisode => ({
    kind,
    fromWeek: levels[from + 1]!.fromWeek,
    toWeek: levels[to]!.fromWeek,
    change: changeBetween(levels[from]!, levels[to]!),
    regained: null,
    remaining: null,
    z: stepZ(levels[from]!, levels[to]!, floor),
    steps,
    runs: runsIn(from, to),
    ...over,
  })
  const slip: { open: Move | null } = { open: null }
  // A step at a change the card declared stands on the card's bar: its direction is its sign, the floor already cleared.
  const stepOf = (move: Move) => coreOf(levels[move.to]!).m - coreOf(levels[move.from]!).m
  const fell = (move: Move, change: Ranged) => (move.forced ? stepOf(move) < 0 : falling(change))
  const rose = (move: Move, change: Ranged) => (move.forced ? stepOf(move) > 0 : rising(change))
  /** Closes the open slip as one the level never came back from, ended at `toWeek` (a further fall) or still open at the horizon. */
  const closeOpen = (toWeek: number | null = null) => {
    const move = slip.open
    if (move === null) return
    if (fell(move, changeBetween(levels[move.from]!, levels[move.to]!))) {
      out.push(episode('slip-open', move.from, move.to, move.steps, { toWeek }))
    }
    slip.open = null
  }
  for (const move of movesOf(levels, breaks, delta)) {
    const change = changeBetween(levels[move.from]!, levels[move.to]!)
    if (move.afterBreak) {
      closeOpen()
      if (rising(change) || falling(change)) {
        out.push(episode('after-break', move.from, move.to, move.steps))
      }
    } else if (fell(move, change)) {
      const current = slip.open
      if (current !== null && move.forced) {
        // A fall the card declared on its own, with no return since the last: the last slip ended where this one began.
        closeOpen(levels[move.from + 1]!.fromWeek)
        slip.open = move
      } else {
        // A second fall with no return between is the same slip going on.
        slip.open =
          current === null ? move : { ...current, to: move.to, steps: current.steps + move.steps }
      }
    } else if (rose(move, change)) {
      const fall = slip.open
      if (fall === null) {
        out.push(episode('improvement', move.from, move.to, move.steps))
        continue
      }
      slip.open = null
      const pre = levels[fall.from]!
      const post = levels[move.to]!
      const regained = change
      const returned = {
        toWeek: levels[move.to]!.fromWeek,
        regained,
        runs: runsIn(fall.from, move.to),
      }
      const fallWeek = levels[fall.from + 1]!.fromWeek
      // A shortfall the page writes as 0% is back, however loosely the levels are known: "still 0% lower" is not a claim.
      // A real partial whose range is wholly below the old level stays partly back (hindsight.sim.test.ts holds the rate).
      const remaining = changeBetween(pre, post)
      if (
        isBack(pre, post, floor) ||
        cardSaidBack(live, fallWeek, levels[move.to]!.fromWeek, pre, post, floor) ||
        Math.abs(remaining.value) < NOTHING
      ) {
        out.push(episode('slip-back', fall.from, fall.to, fall.steps, returned))
        // Back, and clear above where it was: the return, then the excess as a rise of its own.
        if (rising(remaining) && post.m - pre.m >= delta) {
          out.push(
            episode('improvement', fall.from, move.to, move.steps, {
              fromWeek: levels[move.from + 1]!.fromWeek,
              runs: runsIn(move.from, move.to),
            }),
          )
        }
      } else {
        out.push(
          episode('slip-partly-back', fall.from, fall.to, fall.steps, {
            ...returned,
            remaining,
          }),
        )
      }
    }
  }
  closeOpen()
  return out
}
