import { describe, expect, it } from 'vitest'
import type { CurveRow } from './curveTable'
import { curveTakeaway } from './sportCurveTakeaway'

const row = (durationS: number, value: number, previous = NaN): CurveRow => ({
  durationS,
  value,
  previous,
  activityId: 'a',
})

const base = { units: 'metric', threshold: null, previousLabel: 'Previous 12 weeks' } as const

describe('curveTakeaway with a period before', () => {
  it('says how far a run’s 20 minutes moved, in seconds per kilometre, and which way', () => {
    // 4.0 m/s is 250 s/km; 3.8 m/s is 263 s/km.
    const quicker = curveTakeaway({
      ...base,
      sport: 'run',
      rows: [row(300, 4.4, 4.2), row(1200, 4.0, 3.8)],
    })
    expect(quicker).toBe('20 min is 13 s /km quicker than the previous 12 weeks')
    const slower = curveTakeaway({ ...base, sport: 'run', rows: [row(1200, 3.8, 4.0)] })
    expect(slower).toBe('20 min is 13 s /km slower than the previous 12 weeks')
  })

  it('says it in the athlete’s units', () => {
    const text = curveTakeaway({
      ...base,
      units: 'imperial',
      sport: 'run',
      rows: [row(1200, 4.0, 3.8)],
    })
    expect(text).toBe('20 min is 21 s /mi quicker than the previous 12 weeks')
  })

  it('says how far a ride’s 20 minutes moved, in watts, and which way', () => {
    const higher = curveTakeaway({
      ...base,
      sport: 'ride',
      rows: [row(1200, 250, 238)],
      previousLabel: 'Previous 6 weeks',
    })
    expect(higher).toBe('20 min is 12 W higher than the previous 6 weeks')
    const lower = curveTakeaway({ ...base, sport: 'ride', rows: [row(1200, 238, 250)] })
    expect(lower).toBe('20 min is 12 W lower than the previous 12 weeks')
  })

  it('says it held steady when the two are the same', () => {
    expect(curveTakeaway({ ...base, sport: 'run', rows: [row(1200, 4.0, 4.0)] })).toBe(
      'Your 20 min pace held steady against the previous 12 weeks',
    )
    expect(curveTakeaway({ ...base, sport: 'ride', rows: [row(1200, 250, 250)] })).toBe(
      'Your 20 min power held steady against the previous 12 weeks',
    )
  })

  it('says it held steady when the move is smaller than 1%, or rounds to nothing', () => {
    // 250 W against 248 W is 0.8%.
    expect(curveTakeaway({ ...base, sport: 'ride', rows: [row(1200, 250, 248)] })).toContain(
      'held steady',
    )
  })

  it('says it held steady when the move is inside the threshold’s own range', () => {
    // A 13 s/km move, against a threshold whose range spans 63 s/km.
    const inside = curveTakeaway({
      ...base,
      sport: 'run',
      rows: [row(1200, 4.0, 3.8)],
      threshold: { value: 4.0, low: 3.5, high: 4.5 },
    })
    expect(inside).toBe('Your 20 min pace held steady against the previous 12 weeks')
    const outside = curveTakeaway({
      ...base,
      sport: 'run',
      rows: [row(1200, 4.0, 3.8)],
      threshold: { value: 4.0, low: 3.95, high: 4.05 },
    })
    expect(outside).toContain('quicker')
  })

  it('reads the longest effort both periods have when there is no 20 minute one in both', () => {
    const text = curveTakeaway({
      ...base,
      sport: 'ride',
      rows: [row(300, 320, 300), row(1200, 250), row(3600, 210, 200)],
    })
    expect(text).toBe('60 min is 10 W higher than the previous 12 weeks')
  })

  it('names the best when the period before shares no effort with this one', () => {
    expect(curveTakeaway({ ...base, sport: 'ride', rows: [row(1200, 250, NaN)] })).toBe(
      'Best 20 min: 250 W',
    )
  })
})

describe('curveTakeaway with no period before', () => {
  const none = { units: 'metric', threshold: null, previousLabel: null } as const

  it('names the best 20 minutes, with its level when there is one', () => {
    expect(curveTakeaway({ ...none, sport: 'run', rows: [row(1200, 4.0)], level: 'Local' })).toBe(
      'Best 20 min: 4:10 /km, Local',
    )
    expect(curveTakeaway({ ...none, sport: 'run', rows: [row(1200, 4.0)] })).toBe(
      'Best 20 min: 4:10 /km',
    )
  })

  it('names the longest effort instead, without the level, when there is no 20 minute one', () => {
    expect(
      curveTakeaway({
        ...none,
        sport: 'ride',
        rows: [row(60, 400), row(300, 320)],
        level: 'Local',
      }),
    ).toBe('Best 5 min: 320 W')
  })

  it('has nothing to say for a curve with no effort', () => {
    expect(curveTakeaway({ ...none, sport: 'ride', rows: [] })).toBeNull()
  })
})
