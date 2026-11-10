import { describe, expect, it } from 'vitest'
import { buildLiftState, liftChange, liftGrade, liftHistory, WINDOW_DAYS } from '@rca/core/lift'
import { formatLoad } from '@rca/core/units'
import { LAST_SQUAT_DAY, risingSquats, squat } from './liftFixtures'
import { LOAD_WEEKS, liftOverviewOf, loadParts, rangeText } from './liftEntries'

const SETTINGS = { massKg: 80, bikeMassKg: 9 }
const PROFILE = { birthYear: 1990, sex: 'male' } as const

const bench = (date: string, loadKg: number) =>
  squat(date, loadKg, { exercise: 'bench-press', equipment: 'barbell' })

describe('liftOverviewOf', () => {
  const sets = risingSquats()
  const overview = liftOverviewOf(sets, SETTINGS, PROFILE, 'metric', LAST_SQUAT_DAY)

  it('leads with the most recently trained lift that has an estimate, and its figures are core’s', () => {
    const state = buildLiftState(sets, SETTINGS)
    const estimate = state.lifts[0]!.estimate!
    expect(overview.lead?.title).toBe('Back squat, barbell')
    expect(overview.lead?.estimate).toEqual(estimate)
    expect(overview.lead?.floor).toEqual(estimate.floor)
    expect(overview.lead?.change).toBe(liftChange(sets, estimate.date, WINDOW_DAYS))
    expect(overview.lead?.grade).toEqual(
      liftGrade({ lift: 'squat', estimate }, PROFILE, SETTINGS.massKg),
    )
    expect(overview.entries[0]?.history).toEqual(liftHistory(sets))
  })

  it('has no grade for a lift outside the big three, and none without an estimate to lead', () => {
    const curl = squat('2031-01-02', 20, { exercise: 'biceps-curl', equipment: 'dumbbell' })
    expect(liftOverviewOf([curl], SETTINGS, PROFILE, 'metric', '2031-01-03').lead?.grade).toBeNull()
    const warmup = squat('2031-01-02', 60, { warmup: true })
    const none = liftOverviewOf([warmup], SETTINGS, PROFILE, 'metric', '2031-01-03')
    expect(none.lead).toBeNull()
    expect(none.entries).toEqual([])
  })

  it('leads with the lift trained last when two have estimates', () => {
    const two = [...sets, bench('2031-03-05', 60)]
    expect(liftOverviewOf(two, SETTINGS, PROFILE, 'metric', '2031-03-06').lead?.title).toBe(
      'Bench press, barbell',
    )
  })

  it('gives each estimated lift its detail rows: max, floor, times body mass, last session, sets and effort', () => {
    const rows = overview.entries[0]!.rows
    expect(rows.map((row) => row.label)).toEqual([
      'One-rep max',
      'Floor',
      'Times body mass',
      'Last session',
      'Sets in the last 8 weeks',
      'Effort',
    ])
    expect(rows[0]!.value).toBe(
      `${formatLoad(overview.lead!.estimate.point, 'metric')}, ${rangeText(
        overview.lead!.estimate.low,
        overview.lead!.estimate.high,
        'metric',
      )}`,
    )
    expect(rows[4]!.value).toBe('14')
    expect(rows[5]!.value).toBe('RPE on 14 of 14 sessions')
  })

  it('leaves times body mass out without a mass, and effort out when no session is in the window', () => {
    const noMass = liftOverviewOf(
      sets,
      { massKg: 0, bikeMassKg: 9 },
      PROFILE,
      'metric',
      '2031-03-02',
    )
    expect(noMass.entries[0]!.rows.map((row) => row.label)).not.toContain('Times body mass')
    const late = liftOverviewOf(sets, SETTINGS, PROFILE, 'metric', '2032-01-01')
    expect(late.entries[0]!.rows.map((row) => row.label)).not.toContain('Effort')
    expect(late.entries[0]!.rows.find((row) => row.label.startsWith('Sets'))?.value).toBe('0')
  })

  it('lists rep bests as rows and the last twelve weeks of load with empty weeks as zeros', () => {
    expect(overview.entries[0]!.bests.map((row) => row.label)).toEqual(['5 reps'])
    expect(overview.weeks).toHaveLength(LOAD_WEEKS)
    expect(overview.weeks.at(-1)!.weekStart).toBe('2031-02-24')
    const gap = liftOverviewOf(
      [squat('2031-01-06', 100), squat('2031-02-24', 100)],
      SETTINGS,
      PROFILE,
      'metric',
      '2031-02-25',
    )
    expect(gap.weeks.some((week) => week.regions.lower.workingSets === 0)).toBe(true)
    expect(liftOverviewOf([], SETTINGS, PROFILE, 'metric', '2031-02-25').weeks).toEqual([])
  })

  it('writes loads in the athlete’s unit', () => {
    expect(loadParts(100, 'imperial')).toEqual({ number: '220.5', unit: 'lb' })
    expect(rangeText(100, 110, 'metric')).toBe('100 to 110 kg')
  })
})
