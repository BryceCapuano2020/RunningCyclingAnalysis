import { describe, expect, it } from 'vitest'
import type { MatchFigure } from '@rca/core/standing'
import { levelTarget, levelTargetText, targetRows } from './levelTarget'

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

describe('levelTarget: core’s match figure as figures', () => {
  it('gives a ride its centre in watts, its range from the match figures, and the watts the page shows now', () => {
    const target = levelTarget(figure({}), 'metric')
    expect(target).toMatchObject({
      higher: 'run',
      lower: 'ride',
      centre: '270 W',
      range: '245\u2013295',
      now: '255 W',
    })
    expect(levelTargetText(figure({}), 'metric')).toBe(
      'To match it on the bike: 270 W (245\u2013295). Your ride threshold: 255 W.',
    )
    expect(targetRows(target!)).toEqual([
      { label: 'To match it on the bike', value: '270 W (245\u2013295)' },
      { label: 'Your ride threshold', value: '255 W' },
    ])
  })

  it('gives a run a pace in the units asked for, with no range', () => {
    const run = figure({
      higher: 'ride',
      lower: 'run',
      low: 1000 / 300,
      centre: 1000 / 300,
      high: 1000 / 300,
      now: 1000 / 330,
    })
    expect(levelTarget(run, 'metric')?.range).toBeNull()
    expect(targetRows(levelTarget(run, 'metric')!)).toEqual([
      { label: 'To match it on the run', value: '5:00 /km' },
      { label: 'Your run threshold', value: '5:30 /km' },
    ])
    expect(levelTarget(run, 'imperial')?.centre).toMatch(/^\d:\d\d \/mi$/)
  })

  it('names nothing without a figure', () => {
    expect(levelTarget(null, 'metric')).toBeNull()
    expect(levelTargetText(null, 'metric')).toBeNull()
  })
})
