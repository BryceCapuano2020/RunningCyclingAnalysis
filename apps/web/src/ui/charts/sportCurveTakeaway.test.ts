import { describe, expect, it } from 'vitest'
import type { CurveRow } from './curveTable'
import { changeOf } from './changeFixtures'
import { DURATIONS_S } from '@rca/core/constants'
import type { ChangeEvidence } from '@rca/core/change/types'
import { citedDurationS, curveTakeaway, namedChangeAt, takeawayAt } from './sportCurveTakeaway'

const row = (
  durationS: number,
  value: number,
  previous = NaN,
  carry: { carried?: boolean; previousCarried?: boolean } = {},
): CurveRow => ({ durationS, value, previous, activityId: 'a', ...carry })

const base = {
  units: 'metric',
  previousLabel: 'Previous 12 weeks',
  change: changeOf('higher'),
} as const
const unchanged = { ...base, change: changeOf('none') } as const
/** What a 20 minute row with no clear change reads, with the smallest change the headline band could have called. */
const NONE =
  "No clear change in 20 min from the previous 12 weeks; changes under 7% can't be told apart here"
const lower = { ...base, change: changeOf('lower') } as const

describe('curveTakeaway with a period before', () => {
  it('says how far a run’s 20 minutes moved, in seconds per kilometre, and which way', () => {
    // 4.0 m/s is 250 s/km; 3.8 m/s is 263 s/km.
    const faster = curveTakeaway({
      ...base,
      sport: 'run',
      rows: [row(300, 4.4, 4.2), row(1200, 4.0, 3.8)],
    })
    expect(faster).toBe('20 min is 13 s/km faster than the previous 12 weeks')
    const slower = curveTakeaway({ ...lower, sport: 'run', rows: [row(1200, 3.8, 4.0)] })
    expect(slower).toBe('20 min is 13 s/km slower than the previous 12 weeks')
  })

  it('says it in the athlete’s units, with the unit set tight to the seconds', () => {
    const text = curveTakeaway({
      ...base,
      units: 'imperial',
      sport: 'run',
      rows: [row(1200, 4.0, 3.8)],
    })
    expect(text).toBe('20 min is 21 s/mi faster than the previous 12 weeks')
  })

  it('says how far a ride’s 20 minutes moved, in watts, and which way', () => {
    const higher = curveTakeaway({
      ...base,
      sport: 'ride',
      rows: [row(1200, 250, 238)],
      previousLabel: 'Previous 6 weeks',
    })
    expect(higher).toBe('20 min is 12 W higher than the previous 6 weeks')
    expect(curveTakeaway({ ...lower, sport: 'ride', rows: [row(1200, 238, 250)] })).toBe(
      '20 min is 12 W lower than the previous 12 weeks',
    )
  })

  it('says there is no clear change when the two are the same', () => {
    expect(curveTakeaway({ ...unchanged, sport: 'run', rows: [row(1200, 4.0, 4.0)] })).toBe(NONE)
    expect(curveTakeaway({ ...unchanged, sport: 'ride', rows: [row(1200, 250, 250)] })).toBe(NONE)
  })

  describe('the change test decides whether a move is a change', () => {
    it('says no clear change for a move the test does not call, however big it looks', () => {
      expect(curveTakeaway({ ...unchanged, sport: 'ride', rows: [row(1200, 300, 250)] })).toBe(NONE)
      expect(curveTakeaway({ ...unchanged, sport: 'run', rows: [row(1200, 4.4, 4.0)] })).toBe(NONE)
    })

    it('words a move the test calls, with the amount the page shows and the direction the figures move', () => {
      expect(curveTakeaway({ ...base, sport: 'ride', rows: [row(1200, 252, 250)] })).toBe(
        '20 min is 2 W higher than the previous 12 weeks',
      )
      expect(
        curveTakeaway({
          ...base,
          change: changeOf('lower'),
          sport: 'ride',
          rows: [row(1200, 238, 250)],
        }),
      ).toBe('20 min is 12 W lower than the previous 12 weeks')
    })

    it('takes the direction from the call, not the watts: the same rider at a lower weight is higher in power per kilogram', () => {
      // 245 W against 250 W is fewer watts, and the call (watts per kilogram) says higher.
      expect(curveTakeaway({ ...base, sport: 'ride', rows: [row(1200, 245, 250)] })).toBe(
        '20 min is 8% more power per kilogram than the previous 12 weeks',
      )
      // The same watts, and the call says lower: a heavier rider.
      expect(curveTakeaway({ ...lower, sport: 'ride', rows: [row(1200, 250, 250)] })).toBe(
        '20 min is 8% less power per kilogram than the previous 12 weeks',
      )
    })

    it('does not word a run’s call as a move when its pace rounds to the same, and says no more than no clear change', () => {
      expect(curveTakeaway({ ...base, sport: 'run', rows: [row(1200, 4.0001, 4.0)] })).toBe(
        'No clear change in 20 min from the previous 12 weeks',
      )
    })

    it('holds the title to the stricter band: a call that leaves only the record band is no clear change', () => {
      const weak = { ...base, change: changeOf('higher', {}, { weak: true }) }
      expect(curveTakeaway({ ...weak, sport: 'ride', rows: [row(1200, 262, 250)] })).toBe(NONE)
      expect(takeawayAt({ ...weak, sport: 'ride', rows: [row(1200, 262, 250)] }, 1200)).toBe(NONE)
    })

    it('falls to the best, comparing nothing, where the test could not judge the length', () => {
      const untested = { ...base, change: changeOf('untested') }
      expect(curveTakeaway({ ...untested, sport: 'ride', rows: [row(1200, 250, 200)] })).toBe(
        'Best 20 min: 250 W',
      )
      expect(citedDurationS({ ...untested, sport: 'ride', rows: [row(1200, 250, 200)] })).toBeNull()
    })

    it('reads another length the test could judge when the 20 minutes is not one', () => {
      const change = changeOf('higher', { 1200: 'untested' })
      const rows = [row(300, 330, 320), row(1200, 263, 250), row(3600, 240, 230)]
      expect(curveTakeaway({ ...base, change, sport: 'ride', rows })).toBe(
        '60 min is 10 W higher than the previous 12 weeks',
      )
    })

    it('is the same on the same data whichever page asks: the title and a length asked for by name', () => {
      const input = { ...base, sport: 'ride', rows: [row(1200, 263, 250)] } as const
      expect(takeawayAt(input, 1200)).toBe(curveTakeaway(input))
      expect(takeawayAt(input, 300)).toBeNull()
      expect(takeawayAt({ ...input, change: changeOf('untested') }, 1200)).toBeNull()
      expect(takeawayAt({ ...input, previousLabel: null }, 1200)).toBeNull()
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
      const none = { units: 'metric', previousLabel: null, change: null } as const
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
          change: null,
          sport: 'ride',
          rows: [row(1200, 250, NaN, { carried: true })],
        }),
      ).toBeNull()
    })
  })
})

describe('curveTakeaway with no period before', () => {
  const none = { units: 'metric', previousLabel: null, change: null } as const

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
    expect(citedDurationS({ ...unchanged, sport: 'ride', rows: [row(900, 250, 250)] })).toBeNull()
  })

  it('is none without a period before, whose title names the best 20 minutes', () => {
    expect(
      citedDurationS({
        ...base,
        previousLabel: null,
        change: null,
        sport: 'ride',
        rows: [row(900, 250, 240)],
      }),
    ).toBeNull()
  })
})

describe('a no-clear-change title whose band is too wide to name a size', () => {
  /** A 20 minute call whose headline band is +-60% (a band of 83% either way), as easy runs mixed with hard ones make. */
  const widened = (strong: number): ChangeEvidence => {
    const evidence = changeOf('none')
    for (const sport of ['run', 'ride'] as const) {
      const index = DURATIONS_S.indexOf(1200)
      evidence[sport][index] = {
        ...evidence[sport][index]!,
        strongLow: -strong,
        strongHigh: strong,
      }
    }
    return evidence
  }
  const title = (strong: number) =>
    curveTakeaway({ ...base, sport: 'run', rows: [row(1200, 4.0, 3.9)], change: widened(strong) })

  it('names no size, and says the efforts vary too much', () => {
    expect(title(0.6)).toBe(
      'No clear change in 20 min from the previous 12 weeks; the efforts vary too much to show a change',
    )
  })

  it('names the size up to a quarter, and not beyond it', () => {
    expect(title(0.2)).toContain("changes under 23% can't be told apart here")
    expect(title(0.25)).toContain('vary too much')
    expect(title(0.22)).not.toContain('vary too much')
  })
})

describe('a best held for its effort', () => {
  const HELD = 'No comparable hard 20 min of running in the previous 12 weeks.'
  const input = { ...unchanged, sport: 'run', rows: [row(1200, 4.0, 3.9)] } as const

  it('gives the gate’s reason, the one the Balance strip gives, and not that the efforts vary', () => {
    expect(curveTakeaway({ ...input, held: HELD })).toBe(HELD)
    expect(curveTakeaway(input)).toContain('No clear change')
  })

  it('speaks for the 20 min even where the change test did not judge it, as the Balance strip does', () => {
    const untested = { ...input, change: changeOf('untested') }
    expect(curveTakeaway(untested)).toBe('Best 20 min: 4:10 /km')
    expect(curveTakeaway({ ...untested, held: HELD })).toBe(HELD)
    expect(takeawayAt({ ...untested, held: HELD }, 1200)).toBe(HELD)
  })

  it('leaves a second chart of the finding to cite only a change, so the page says no change once', () => {
    expect(takeawayAt(input, 1200)).toContain('No clear change')
    expect(namedChangeAt(input, 1200)).toBeNull()
    expect(namedChangeAt({ ...input, change: changeOf('higher') }, 1200)).toContain('is')
  })
})
