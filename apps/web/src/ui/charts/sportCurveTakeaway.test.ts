import { describe, expect, it } from 'vitest'
import type { CurveRow } from './curveTable'
import { citedDurationS, curveTakeaway } from './sportCurveTakeaway'

const row = (
  durationS: number,
  value: number,
  previous = NaN,
  carry: { carried?: boolean; previousCarried?: boolean } = {},
): CurveRow => ({ durationS, value, previous, activityId: 'a', ...carry })

const base = { units: 'metric', previousLabel: 'Previous 12 weeks' } as const

describe('curveTakeaway with a period before', () => {
  it('says how far a run’s 20 minutes moved, in seconds per kilometre, and which way', () => {
    // 4.0 m/s is 250 s/km; 3.8 m/s is 263 s/km.
    const quicker = curveTakeaway({
      ...base,
      sport: 'run',
      rows: [row(300, 4.4, 4.2), row(1200, 4.0, 3.8)],
    })
    expect(quicker).toBe('20 min is 13 s/km quicker than the previous 12 weeks')
    const slower = curveTakeaway({ ...base, sport: 'run', rows: [row(1200, 3.8, 4.0)] })
    expect(slower).toBe('20 min is 13 s/km slower than the previous 12 weeks')
  })

  it('says it in the athlete’s units, with the unit set tight to the seconds', () => {
    const text = curveTakeaway({
      ...base,
      units: 'imperial',
      sport: 'run',
      rows: [row(1200, 4.0, 3.8)],
    })
    expect(text).toBe('20 min is 21 s/mi quicker than the previous 12 weeks')
  })

  it('says how far a ride’s 20 minutes moved, in watts, and which way', () => {
    const higher = curveTakeaway({
      ...base,
      sport: 'ride',
      rows: [row(1200, 250, 238)],
      previousLabel: 'Previous 6 weeks',
    })
    expect(higher).toBe('20 min is 12 W higher than the previous 6 weeks')
    expect(curveTakeaway({ ...base, sport: 'ride', rows: [row(1200, 238, 250)] })).toBe(
      '20 min is 12 W lower than the previous 12 weeks',
    )
  })

  it('says there is no clear change when the two are the same', () => {
    expect(curveTakeaway({ ...base, sport: 'run', rows: [row(1200, 4.0, 4.0)] })).toBe(
      'No clear change against the previous 12 weeks',
    )
    expect(curveTakeaway({ ...base, sport: 'ride', rows: [row(1200, 250, 250)] })).toBe(
      'No clear change against the previous 12 weeks',
    )
  })

  describe('the floor a change must clear', () => {
    const ride = (value: number, previous: number) =>
      curveTakeaway({ ...base, sport: 'ride', rows: [row(1200, value, previous)] })
    // A 400 W effort: 1% is 4 W, which is above the 2 W floor.
    it('is 1% of the earlier value, where that is more than the fixed floor', () => {
      expect(ride(404, 400)).toBe('No clear change against the previous 12 weeks')
      expect(ride(405, 400)).toBe('20 min is 5 W higher than the previous 12 weeks')
    })

    it('is 2 W for a ride, where 1% is less', () => {
      // 150 W: 1% is 1.5 W, so the 2 W floor governs.
      expect(ride(152, 150)).toBe('No clear change against the previous 12 weeks')
      expect(ride(153, 150)).toBe('20 min is 3 W higher than the previous 12 weeks')
    })

    it('is 2 s/km for a run in metric and 3 s/mi in imperial', () => {
      // Speeds that are 250 s/km and about 247 s/km apart by 2 and 3 s/km.
      const run = (units: 'metric' | 'imperial', now: number, before: number) =>
        curveTakeaway({ ...base, units, sport: 'run', rows: [row(1200, now, before)] })
      expect(run('metric', 4.0, 1000 / 252)).toBe('No clear change against the previous 12 weeks')
      expect(run('metric', 4.0, 1000 / 253)).toContain('s/km quicker')
      // 4 m/s is 402.3 s/mi; 3 s/mi slower is 405.3 s/mi.
      const mi = 1609.344
      expect(run('imperial', 4.0, mi / 405.3)).toBe('No clear change against the previous 12 weeks')
      expect(run('imperial', 4.0, mi / 406.5)).toContain('s/mi quicker')
    })

    it('is the same whatever the fit says about its own spread, so the same data has one verdict', () => {
      // The same two curves, with and without a threshold: curveTakeaway does not take one.
      const rows = [row(1200, 4.0, 3.8)]
      expect(curveTakeaway({ ...base, sport: 'run', rows })).toBe(
        curveTakeaway({ ...base, sport: 'run', rows: [...rows] }),
      )
    })
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

  describe('carried values', () => {
    it('does not read a carried 20 minute value as a 20 minute finding: it reads the longest measured effort both share', () => {
      const text = curveTakeaway({
        ...base,
        sport: 'ride',
        rows: [row(300, 320, 300), row(1200, 250, 240, { carried: true }), row(3600, 250, 230)],
      })
      expect(text).toBe('60 min is 20 W higher than the previous 12 weeks')
    })

    it('skips a row that is carried in the previous period too', () => {
      const text = curveTakeaway({
        ...base,
        sport: 'ride',
        rows: [row(300, 320, 300), row(1200, 250, 240, { previousCarried: true })],
      })
      expect(text).toBe('5 min is 20 W higher than the previous 12 weeks')
    })

    it('names no comparison, and falls to the best, when every shared row is carried on a side', () => {
      const text = curveTakeaway({
        ...base,
        sport: 'ride',
        rows: [
          row(1200, 250, 240, { carried: true }),
          row(3600, 250, 240, { previousCarried: true }),
        ],
      })
      expect(text).toBe('Best 60 min: 250 W')
    })

    it('does not name a carried 20 minute value as the best, or give it the level', () => {
      const none = { units: 'metric', previousLabel: null } as const
      const text = curveTakeaway({
        ...none,
        sport: 'ride',
        rows: [row(1200, 250, NaN, { carried: true }), row(3600, 250)],
        level: 'Local',
      })
      expect(text).toBe('Best 60 min: 250 W')
    })

    it('has nothing to say where every effort is carried', () => {
      expect(
        curveTakeaway({
          units: 'metric',
          previousLabel: null,
          sport: 'ride',
          rows: [row(1200, 250, NaN, { carried: true })],
        }),
      ).toBeNull()
    })
  })
})

describe('curveTakeaway with no period before', () => {
  const none = { units: 'metric', previousLabel: null } as const

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

describe('citedDurationS', () => {
  it('is the effort the comparison reads, when the title cites it', () => {
    const rows = [
      row(300, 330, 320),
      row(900, 280, 216),
      row(1200, 263, 263, { previousCarried: true }),
    ]
    // The 20 minute effort is carried in the earlier period, so the comparison reads the 15 minutes: 64 W.
    expect(curveTakeaway({ ...base, sport: 'ride', rows })).toBe(
      '15 min is 64 W higher than the previous 12 weeks',
    )
    expect(citedDurationS({ ...base, sport: 'ride', rows })).toBe(900)
  })

  it('is the 20 minutes when that is what the comparison reads', () => {
    expect(
      citedDurationS({ ...base, sport: 'ride', rows: [row(300, 330, 320), row(1200, 263, 250)] }),
    ).toBe(1200)
  })

  it('is none when the title says no clear change, which cites no effort', () => {
    expect(citedDurationS({ ...base, sport: 'ride', rows: [row(900, 250, 250)] })).toBeNull()
  })

  it('is none without a period before, whose title names the best 20 minutes', () => {
    expect(
      citedDurationS({ ...base, previousLabel: null, sport: 'ride', rows: [row(900, 250, 240)] }),
    ).toBeNull()
  })
})
