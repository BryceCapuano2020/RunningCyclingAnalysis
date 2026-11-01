import { describe, expect, it } from 'vitest'
import { episodesOf } from './episodes'
import type { LiveEpisode } from './live'
import type { Level } from './segments'

/** Three plateaus: a level, a fall of 12%, and a return to `back` (log units), each with its own standard error. */
function levels(back: number, ses: [number, number, number]): Level[] {
  const plateau = (i: number, m: number): Level => ({
    fromWeek: i * 30,
    toWeek: (i + 1) * 30,
    m,
    se: ses[i]!,
    n: 40,
  })
  return [plateau(0, 0), plateau(1, -0.12), plateau(2, back)]
}

describe('a return that leaves something missing', () => {
  it('is partly back when the range of what is missing is wholly below the old level', () => {
    const out = episodesOf(levels(-0.05, [0.005, 0.005, 0.005]), [], 0.015, 0.04)
    expect(out.map((e) => e.kind)).toEqual(['slip-partly-back'])
    expect(out[0]!.remaining!.high).toBeLessThan(0)
  })

  it('is back when what is missing is written as 0%, however loosely the old level is known', () => {
    const out = episodesOf(levels(-0.0002, [0.04, 0.005, 0.005]), [], 0.015, 0.04)
    expect(out.map((e) => e.kind)).toEqual(['slip-back'])
    expect(out[0]!.remaining).toBeNull()
    expect(out[0]!.regained!.low).toBeGreaterThan(0)
  })

  it('stays partly back when a shortfall that is not nothing has a range reaching the old level', () => {
    // The sims hold how often a real partial of this kind is called back: it is a rate, so this is not widened.
    const out = episodesOf(levels(-0.05, [0.04, 0.005, 0.005]), [], 0.015, 0.04)
    expect(out.map((e) => e.kind)).toEqual(['slip-partly-back'])
    expect(out[0]!.remaining!.high).toBeGreaterThan(0)
  })
})

describe('a return the fitness card called back', () => {
  // 3.6% short with tight levels: past the point bar, so only the card can call it back, yet the range stays below zero.
  const short = levels(-0.036, [0.002, 0.002, 0.002])
  const card = (over: Partial<LiveEpisode> = {}): LiveEpisode => ({
    declaredWeek: 31,
    backWeek: 62,
    recoveringWeek: 45,
    relapsed: false,
    ...over,
  })

  it('is back when the card said back for this slip', () => {
    expect(episodesOf(short, [], 0.015, 0.04, [card()]).map((e) => e.kind)).toEqual(['slip-back'])
  })

  it('stays partly back without the card, when the card reopened the slip, or when its back belongs to another slip', () => {
    const kinds = (live: LiveEpisode[]) => episodesOf(short, [], 0.015, 0.04, live)[0]!.kind
    expect(kinds([])).toBe('slip-partly-back')
    expect(kinds([card({ relapsed: true })])).toBe('slip-partly-back')
    expect(kinds([card({ declaredWeek: 91, backWeek: 120 })])).toBe('slip-partly-back')
  })
})
