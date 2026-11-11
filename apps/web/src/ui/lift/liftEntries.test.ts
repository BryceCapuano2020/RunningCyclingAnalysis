import { describe, expect, it } from 'vitest'
import { buildLiftState, liftChange, liftGrade, liftHistory, WINDOW_DAYS } from '@rca/core/lift'
import { formatMass } from '@rca/core/units'
import { LAST_SQUAT_DAY, risingSquats, squat } from './liftFixtures'
import { LOAD_WEEKS, liftOverviewOf, loadParts, rangeText } from './liftEntries'
import { resultsFor } from './liftResultsKit'

const SETTINGS = { massKg: 80, bikeMassKg: 9 }
const PROFILE = { birthYear: 1990, sex: 'male' } as const

const bench = (date: string, loadKg: number) =>
  squat(date, loadKg, { exercise: 'bench-press', equipment: 'barbell' })

describe('liftOverviewOf', () => {
  const sets = risingSquats()
  const overview = liftOverviewOf(resultsFor(sets, SETTINGS, PROFILE, LAST_SQUAT_DAY), 'metric')

  it('leads with the most recently trained lift that has an estimate, and its figures are core’s', () => {
    const state = buildLiftState(sets, SETTINGS)
    const estimate = state.lifts[0]!.estimate!
    expect(overview.lead?.title).toBe('Back squat, barbell')
    expect(overview.lead?.estimate).toEqual(estimate)
    expect(overview.lead?.floor).toEqual(estimate.floor)
    expect(overview.lead?.change).toBe(liftChange(sets, estimate.date, WINDOW_DAYS))
    expect(overview.lead?.grade).toEqual(liftGrade({ lift: 'squat', estimate }, PROFILE, SETTINGS))
    expect(overview.lifts[0]?.history).toEqual(liftHistory(sets))
  })

  it('gives the lead no grade while the weight is a placeholder the athlete did not enter', () => {
    const assumed = { ...SETTINGS, massAssumed: true as const }
    expect(
      liftOverviewOf(resultsFor(sets, assumed, PROFILE, LAST_SQUAT_DAY), 'metric').lead?.grade,
    ).toEqual({
      kind: 'gap',
      why: 'no-mass',
    })
  })

  it('ends the weekly load at this week, so weeks with no lifting since the last set show as empty', () => {
    const later = liftOverviewOf(resultsFor(sets, SETTINGS, PROFILE, '2031-04-08'), 'metric')
    expect(later.weeks).toHaveLength(LOAD_WEEKS)
    expect(later.weeks.at(-1)!.weekStart).toBe('2031-04-07')
    expect(later.weeks.at(-1)!.regions.lower.workingSets).toBe(0)
  })

  it('has no grade for a lift outside the big three, and none without an estimate to lead', () => {
    const curl = squat('2031-01-02', 20, { exercise: 'biceps-curl', equipment: 'dumbbell' })
    expect(
      liftOverviewOf(resultsFor([curl], SETTINGS, PROFILE, '2031-01-03'), 'metric').lead?.grade,
    ).toBeNull()
    const warmup = squat('2031-01-02', 60, { warmup: true })
    const none = liftOverviewOf(resultsFor([warmup], SETTINGS, PROFILE, '2031-01-03'), 'metric')
    expect(none.lead).toBeNull()
    expect(none.lifts).toEqual([])
  })

  it('leads with the lift trained last when two have estimates', () => {
    const two = [...sets, bench('2031-03-05', 60)]
    expect(
      liftOverviewOf(resultsFor(two, SETTINGS, PROFILE, '2031-03-06'), 'metric').lead?.title,
    ).toBe('Bench press, barbell')
  })

  it('gives each estimated lift its detail rows: max, floor, times body mass, last session, sets and effort', () => {
    const rows = overview.lifts[0]!.rows
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
      resultsFor(sets, { massKg: 0, bikeMassKg: 9 }, PROFILE, '2031-03-02'),
      'metric',
    )
    expect(noMass.lifts[0]!.rows.map((row) => row.label)).not.toContain('Times body mass')
    const late = liftOverviewOf(resultsFor(sets, SETTINGS, PROFILE, '2032-01-01'), 'metric')
    expect(late.lifts[0]!.rows.map((row) => row.label)).not.toContain('Effort')
    expect(late.lifts[0]!.rows.find((row) => row.label.startsWith('Sets'))?.value).toBe('0')
  })

  it('lists rep bests as rows and the last twelve weeks of load with empty weeks as zeros', () => {
    expect(overview.lifts[0]!.bests.map((row) => row.label)).toEqual(['5 reps'])
    expect(overview.weeks).toHaveLength(LOAD_WEEKS)
    expect(overview.weeks.at(-1)!.weekStart).toBe('2031-02-24')
    const gap = liftOverviewOf(
      resultsFor(
        [squat('2031-01-06', 100), squat('2031-02-24', 100)],
        SETTINGS,
        PROFILE,
        '2031-02-25',
      ),
      'metric',
    )
    expect(gap.weeks.some((week) => week.regions.lower.workingSets === 0)).toBe(true)
    expect(liftOverviewOf(resultsFor([], SETTINGS, PROFILE, '2031-02-25'), 'metric').weeks).toEqual(
      [],
    )
  })

  it('breaks a tie of dates by the larger estimate, not the name, and leads with a big-three lift', () => {
    const day = '2031-03-02'
    const curl = (name: string, load: number) =>
      squat(day, load, { exercise: name, equipment: 'dumbbell' })
    const others = liftOverviewOf(
      resultsFor([curl('aaa-curl', 20), curl('zzz-curl', 40)], SETTINGS, PROFILE, day),
      'metric',
    )
    expect(others.lead?.title).toBe('Zzz curl, dumbbell')
    const mixed = liftOverviewOf(
      resultsFor([curl('aaa-curl', 90), squat(day, 60), bench(day, 80)], SETTINGS, PROFILE, day),
      'metric',
    )
    // Both big-three lifts were trained on the day: the larger estimate leads, and the curl never does.
    expect(mixed.lead?.title).toBe('Bench press, barbell')
    const big = liftOverviewOf(
      resultsFor([curl('aaa-curl', 90), squat(day, 60)], SETTINGS, PROFILE, day),
      'metric',
    )
    expect(big.lead?.title).toBe('Back squat, barbell')
  })

  it('orders every lift big three first in squat, bench, deadlift order, leads with the newest big three, and writes each table row', () => {
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
    const got = liftOverviewOf(resultsFor(sets, SETTINGS, PROFILE, '2031-03-02'), 'metric')
    expect(got.lifts.map((entry) => entry.title)).toEqual([
      'Back squat, barbell',
      'Bench press, barbell',
      'Deadlift, barbell',
      'Biceps curl, dumbbell',
    ])
    expect(got.leadId).toBe(got.lifts[0]!.id)
    // Three plain cells: the one-rep max, the heaviest set and the last session, each once.
    const row = got.lifts[0]!.table
    expect(row.max).toMatch(/^\d+ kg$/)
    expect(row.heaviest).toBe('100 kg × 5')
    expect(row.last).not.toContain('·')
  })

  it('writes estimates in whole units and logged loads as they were logged', () => {
    const got = liftOverviewOf(
      resultsFor([squat('2031-03-02', 61.25, { reps: 11 })], SETTINGS, PROFILE, '2031-03-02'),
      'imperial',
    )
    expect(got.lead?.title).toBe('Back squat, barbell')
    const value = (got.lifts[0]!.rows[0]!.value as string).split(', ')
    expect(value[0]).toMatch(/^\d+ lb$/)
    expect(value[1]).toMatch(/^\d+ to \d+ lb$/)
    expect(got.lifts[0]!.rows[1]!.value).toContain('135 lb')
  })

  it('writes loads in the athlete’s unit', () => {
    expect(loadParts(100, 'imperial')).toEqual({ number: '220.5', unit: 'lb' })
    expect(rangeText(100, 110, 'metric')).toBe('100 to 110 kg')
  })
})
