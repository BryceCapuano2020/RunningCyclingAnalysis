import { describe, expect, it } from 'vitest'
import type { MatchFigure } from '@rca/core/standing'
import { levelTarget, levelTargetText } from './levelTarget'

/** A match figure the way core makes it: the lower sport's own unit, m/s for a run and watts for a ride. */
function figure(over: Partial<MatchFigure>): MatchFigure {
  return {
    higher: 'run',
    lower: 'ride',
    wholePercent: 67,
    low: 245,
    centre: 270,
    high: 295,
    now: 255,
    ...over,
  }
}

describe('levelTarget: the words for core’s match figure', () => {
  it('says what a ride would need, in watts with its range, and the watts the page shows now', () => {
    expect(levelTargetText(figure({}), 'metric')).toBe(
      'To match it on the bike: 270 W threshold (245 to 295). You’re at 255 W.',
    )
    const target = levelTarget(figure({}), 'metric')
    expect(target).toMatchObject({
      higher: 'run',
      lower: 'ride',
      centre: '270 W',
      range: '245 to 295 W',
    })
  })

  it('says what a run would need as a pace, in the units asked for, with no range', () => {
    const run = figure({
      higher: 'ride',
      lower: 'run',
      low: 1000 / 300,
      centre: 1000 / 300,
      high: 1000 / 300,
      now: 1000 / 330,
    })
    expect(levelTargetText(run, 'metric')).toBe(
      'To match it on the run: 5:00 /km threshold. You’re at 5:30 /km.',
    )
    expect(levelTarget(run, 'metric')?.range).toBeNull()
    expect(levelTargetText(run, 'imperial')).toMatch(
      /^To match it on the run: \d:\d\d \/mi threshold\./,
    )
  })

  it('names nothing without a figure', () => {
    expect(levelTarget(null, 'metric')).toBeNull()
    expect(levelTargetText(null, 'metric')).toBeNull()
  })
})
