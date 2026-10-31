import { isBackLevel } from '../fitness/episode'
import { halfWidth, ranged } from '../fitness/status'
import type { Ranged } from '../fitness/types'
import { LOOKBACK } from './params'
import { stepZ } from './segments'
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
  return isBackLevel(post.m - pre.m, Math.sqrt(pre.se ** 2 + post.se ** 2 + floor ** 2))
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
}

/**
 * The steps between neighbouring levels that are as large as `delta` and clear of the floor, grouped into moves:
 * steps in one direction with no level between them longer than `coalesceWeeks` are one move (a slide or a build). A step
 * beside a break is a move of its own.
 */
function movesOf(levels: readonly Level[], breaks: readonly WeekSpan[], delta: number): Move[] {
  const moves: Move[] = []
  for (let i = 1; i < levels.length; i++) {
    const d = levels[i]!.m - levels[i - 1]!.m
    if (Math.abs(d) < delta) continue
    const afterBreak = besideBreak(levels[i]!.fromWeek, breaks)
    const last = moves.at(-1)
    const between = levels[i - 1]!.toWeek - levels[i - 1]!.fromWeek
    if (
      last !== undefined &&
      !afterBreak &&
      !last.afterBreak &&
      last.to === i - 1 &&
      Math.sign(levels[last.to]!.m - levels[last.from]!.m) === Math.sign(d) &&
      between <= LOOKBACK.coalesceWeeks
    ) {
      last.to = i
      last.steps++
    } else moves.push({ from: i - 1, to: i, steps: 1, afterBreak })
  }
  return moves
}

/**
 * The episodes the levels hold. A fall of `delta` or more with a range below zero opens a slip; the next rise closes it
 * as `slip-back` when the level is back (isBack), as `slip-partly-back` when it came part of the way, and a fall with
 * no rise is `slip-open`. A rise with no slip open is an `improvement`; a rise that carries the level clear above where
 * it was before the fall is a return and an improvement of the excess. A step beside a break is `after-break` and
 * ends no slip. Ranges are the printed ones; a change whose range reaches zero is not listed.
 */
export function episodesOf(
  levels: readonly Level[],
  breaks: readonly WeekSpan[],
  floor: number,
  delta: number,
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
  const closeOpen = () => {
    const move = slip.open
    if (move === null) return
    if (falling(changeBetween(levels[move.from]!, levels[move.to]!))) {
      out.push(episode('slip-open', move.from, move.to, move.steps, { toWeek: null }))
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
    } else if (falling(change)) {
      // A second fall with no return between is the same slip going on.
      const current = slip.open
      slip.open =
        current === null ? move : { ...current, to: move.to, steps: current.steps + move.steps }
    } else if (rising(change)) {
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
      if (isBack(pre, post, floor)) {
        out.push(episode('slip-back', fall.from, fall.to, fall.steps, returned))
        // Back, and clear above where it was: the return, then the excess as a rise of its own.
        const excess = changeBetween(pre, post)
        if (rising(excess) && post.m - pre.m >= delta) {
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
            remaining: changeBetween(pre, post),
          }),
        )
      }
    }
  }
  closeOpen()
  return out
}
