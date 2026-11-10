import { describe, expect, it } from 'vitest'
import { buildLiftState, liftChange, liftGrade, liftHistory, WINDOW_DAYS } from '@rca/core/lift'
import { formatMass } from '@rca/core/units'
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
      `${formatMass(overview.lead!.estimate.point, 'metric')}, ${rangeText(
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

  it('breaks a tie of dates by the larger estimate, not the name, and leads with a big-three lift', () => {
    const day = '2031-03-02'
    const curl = (name: string, load: number) =>
      squat(day, load, { exercise: name, equipment: 'dumbbell' })
    const others = liftOverviewOf(
      [curl('aaa-curl', 20), curl('zzz-curl', 40)],
      SETTINGS,
      PROFILE,
      'metric',
      day,
    )
    expect(others.lead?.title).toBe('Zzz curl, dumbbell')
    const mixed = liftOverviewOf(
      [curl('aaa-curl', 90), squat(day, 60), bench(day, 80)],
      SETTINGS,
      PROFILE,
      'metric',
      day,
    )
    // Both big-three lifts were trained on the day: the larger estimate leads, and the curl never does.
    expect(mixed.lead?.title).toBe('Bench press, barbell')
    const big = liftOverviewOf(
      [curl('aaa-curl', 90), squat(day, 60)],
      SETTINGS,
      PROFILE,
      'metric',
      day,
    )
    expect(big.lead?.title).toBe('Back squat, barbell')
  })

  it('charts lifts with a line, big three first in squat, bench, deadlift order, and lists the rest compactly', () => {
    const deadlift = (date: string, load: number) =>
      squat(date, load, { exercise: 'deadlift', equipment: 'barbell' })
    const curl = (date: string, load: number) =>
      squat(date, load, { exercise: 'biceps-curl', equipment: 'dumbbell' })
    const sets = [
      curl('2031-03-01', 20),
      curl('2031-03-02', 21),
      deadlift('2031-02-01', 140),
      deadlift('2031-02-08', 142),
      bench('2031-02-02', 70),
      bench('2031-02-09', 72),
      squat('2031-03-02', 100),
    ]
    const got = liftOverviewOf(sets, SETTINGS, PROFILE, 'metric', '2031-03-02')
    expect(got.entries.map((entry) => entry.title)).toEqual([
      'Bench press, barbell',
      'Deadlift, barbell',
      'Biceps curl, dumbbell',
    ])
    expect(got.others.map((entry) => entry.title)).toEqual(['Back squat, barbell'])
    expect(got.others[0]!.compact.value).toMatch(/ kg · floor .* kg × 5 · /)
  })

  it('writes estimates in whole units and logged loads as they were logged', () => {
    const got = liftOverviewOf(
      [squat('2031-03-02', 61.25, { reps: 11 })],
      SETTINGS,
      PROFILE,
      'imperial',
      '2031-03-02',
    )
    expect(got.lead?.title).toBe('Back squat, barbell')
    expect(got.entries[0] ?? got.others[0]).toBeDefined()
    const value = (got.others[0]!.rows[0]!.value as string).split(', ')
    expect(value[0]).toMatch(/^\d+ lb$/)
    expect(value[1]).toMatch(/^\d+ to \d+ lb$/)
    expect(got.others[0]!.rows[1]!.value).toContain('135 lb')
  })

  it('writes loads in the athlete’s unit', () => {
    expect(loadParts(100, 'imperial')).toEqual({ number: '220.5', unit: 'lb' })
    expect(rangeText(100, 110, 'metric')).toBe('100 to 110 kg')
  })
})
