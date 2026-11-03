import { describe, expect, it } from 'vitest'
import { athlete, hardRunsFrom, NEWEST_MS } from './answer/test/windowLibraries'
import { AnalysisSession } from './session'
import type { SessionState } from './session'
import type { PeriodChoice } from './period'
import type { ActivityDigest, AthleteSettings } from './types'

/* The default period through a session, with digests of runs and rides, so the gate judges the heart rate of real efforts. */

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }

function load(library: ActivityDigest[], choice: PeriodChoice = 'default'): SessionState {
  const session = new AnalysisSession()
  session.clock = () => NEWEST_MS
  session.choosePeriod(choice)
  return session.loadDigests(library, SETTINGS)
}

/** A year and two months of training, so 12 months is a window the library covers. */
const SPAN = 425

describe('the default period through a session', () => {
  it('stays on 12 weeks when both sports have a hard or unchecked best there', () => {
    const state = load(athlete({ spanDays: SPAN, hardRuns: hardRunsFrom(10, 8) }))
    expect(state.answerWindow).toEqual({ choice: 84, reason: 'qualified', passed: [] })
    expect(state.period).toMatchObject({ choice: 'default', days: 84, fellBack: false })
    expect(state.result?.effortGate.run.verdict).toBe('hard')
    // A ride with no heart rate is unchecked, which counts.
    expect(state.result?.effortGate.ride).toMatchObject({
      verdict: 'unknown',
      unchecked: 'noHeartRate',
    })
  })

  it('stays on 12 weeks when the only hard run is 8 months ago: an easy best 20 min is no lack', () => {
    const library = athlete({ spanDays: SPAN, hardRuns: hardRunsFrom(240, 8) })
    const state = load(library)
    expect(state.answerWindow).toEqual({ choice: 84, reason: 'qualified', passed: [] })
    expect(state.period).toMatchObject({ choice: 'default', days: 84, fellBack: false })
    // The gate still says what the 12 weeks held, as a label beside the numbers.
    expect(state.result?.effortGate.run.verdict).toBe('notHard')
  })

  it('widens to 12 months when a sport has too few activities in the shorter windows, and says so', () => {
    // Rides to the present, and runs only 7 to 9 months back.
    const library = [
      ...athlete({ spanDays: SPAN, sports: ['ride'] }),
      ...athlete({ spanDays: 60, from: 220, sports: ['run'] }),
    ]
    const state = load(library)
    expect(state.answerWindow).toEqual({
      choice: 365,
      reason: 'qualified',
      passed: [
        { days: 84, lacks: [{ sport: 'run', lack: 'few' }] },
        { days: 182, lacks: [{ sport: 'run', lack: 'few' }] },
      ],
    })
    // The page is the 12 months: the choice stays the default, and every number is that window's.
    expect(state.period).toMatchObject({ choice: 'default', days: 365, fellBack: false })
    expect(state.previous).not.toBeNull()
    expect(state.result?.activities.length).toBe(load(library, 365).result?.activities.length)
  })

  it('honours an explicit pick exactly, with no search', () => {
    const library = athlete({ spanDays: SPAN, hardRuns: hardRunsFrom(240, 8) })
    for (const choice of [42, 84, 'all'] as const) {
      const state = load(library, choice)
      expect(state.answerWindow).toEqual({ choice, reason: 'asked', passed: [] })
      expect(state.period.choice).toBe(choice)
      expect(state.period.fellBack).toBe(false)
    }
    // Six weeks of easy runs: the gate says so, and the page is still the six weeks.
    const six = load(library, 42)
    expect(six.period.days).toBe(42)
    expect(six.result?.effortGate.run.verdict).toBe('notHard')
  })

  it('stays on 12 weeks when the only hard runs are older than every window', () => {
    // The hard runs are 13 months back, outside every window but all time; the 12 weeks hold easy runs, which qualify.
    const state = load(athlete({ spanDays: SPAN, hardRuns: hardRunsFrom(380, 8) }))
    expect(state.answerWindow).toEqual({ choice: 84, reason: 'qualified', passed: [] })
    expect(state.period).toMatchObject({ choice: 'default', days: 84, fellBack: false })
    expect(state.result?.effortGate.run.verdict).toBe('notHard')
  })

  it('uses all time when a sport has too few activities in every window', () => {
    // Rides to the present; the runs ended nearly two years ago.
    const library = [
      ...athlete({ spanDays: SPAN, sports: ['ride'] }),
      ...athlete({ spanDays: 60, from: 700, sports: ['run'] }),
    ]
    const state = load(library)
    expect(state.answerWindow.choice).toBe('all')
    expect(state.answerWindow.reason).toBe('all-time')
    expect(state.answerWindow.passed.map(({ days, lacks }) => [days, lacks])).toEqual(
      [84, 182, 365].map((days) => [days, [{ sport: 'run', lack: 'few' }]]),
    )
    expect(state.period).toMatchObject({ choice: 'default', days: null, fellBack: true })
  })

  it('asks a one-sport athlete about that sport alone', () => {
    const easy = load(athlete({ spanDays: SPAN, sports: ['run'] }))
    // No ride is asked for; the easy runs qualify in 12 weeks.
    expect(easy.answerWindow).toEqual({ choice: 84, reason: 'qualified', passed: [] })
    // Two runs lately and a spell of them a year ago: the shorter windows lack runs, and no ride is asked about.
    const sparse = [
      ...athlete({ spanDays: 6, sports: ['run'] }),
      ...athlete({ spanDays: 90, from: 300, sports: ['run'] }),
    ]
    const old = load(sparse)
    expect(old.answerWindow).toMatchObject({ choice: 365, reason: 'qualified' })
    expect(old.answerWindow.passed.flatMap(({ lacks }) => lacks.map(({ sport }) => sport))).toEqual(
      ['run', 'run'],
    )
  })

  it('is all time for a library shorter than 12 weeks', () => {
    const state = load(athlete({ spanDays: 50, hardRuns: hardRunsFrom(10, 8) }))
    expect(state.answerWindow).toMatchObject({ choice: 'all', reason: 'qualified' })
    expect(state.period).toMatchObject({ choice: 'default', days: null, fellBack: true })
  })

  it('has the empty window for a session with nothing loaded', () => {
    const session = new AnalysisSession()
    expect(session.clear().answerWindow).toEqual({ choice: 'all', reason: 'all-time', passed: [] })
  })
})
