import { describe, expect, it } from 'vitest'
import '../test/deviceZone'
import { DAY_MS } from '../constants'
import type { AnalysisResult } from '../digest/combine'
import { NO_EFFORT_GATE } from '../effort'
import type { EffortGate } from '../effort'
import { SPORTS } from '../types'
import type { ActivityDigest, Sport } from '../types'
import type { Lack } from './window'
import { WINDOW_DAYS, resolveWindow } from './window'

/*
 * The search over windows, with the analysis of each window made up: the nth window analysed lacks what the nth entry says.
 * The whole path with real digests is in sessionWindow.test.ts.
 */

const NEWEST_MS = Date.UTC(2026, 5, 1, 7)
const YEAR_AND_A_HALF = 430

/** A run and a ride every ten days for `days` days, ending on the newest day. */
function library(days = YEAR_AND_A_HALF): ActivityDigest[] {
  return Array.from({ length: Math.floor(days / 10) + 1 }, (_, i) =>
    SPORTS.map((sport) => ({ sport, startMs: NEWEST_MS - i * 10 * DAY_MS }) as ActivityDigest),
  ).flat()
}

type Lacks = Partial<Record<Sport, Lack>>

/** An analysis in which each sport lacks what `lacks` says, and qualifies where it is not named. */
function analysis(lacks: Lacks): AnalysisResult {
  const activities = SPORTS.flatMap((sport) =>
    Array.from({ length: lacks[sport] === 'few' ? 2 : 3 }, () => ({ sport, indoor: false })),
  )
  const gate = (sport: Sport): EffortGate => ({
    ...NO_EFFORT_GATE,
    verdict: lacks[sport] === 'easy' ? 'notHard' : 'hard',
  })
  const curve = (sport: Sport) =>
    lacks[sport] === 'none' ? [] : [{ durationS: 1200, value: 4, startIndex: 0, windowS: 1200 }]
  return {
    activities,
    runCurve: curve('run'),
    rideCurve: curve('ride'),
    runCp: null,
    rideCp: null,
    effortGate: { run: gate('run'), ride: gate('ride') },
  } as unknown as AnalysisResult
}

/** The search over a library of `days`, where the nth window analysed lacks `outcomes[n]`; returns the answer and the digests each analysis was given. */
function search(outcomes: Lacks[], days = YEAR_AND_A_HALF) {
  const asked: number[] = []
  const answer = resolveWindow(library(days), 'default', (selected) => {
    asked.push(selected.length)
    return analysis(outcomes[asked.length - 1] ?? {})
  })
  return { answer, asked }
}

const RUN_EASY: Lacks = { run: 'easy' }
const BOTH_EASY: Lacks = { run: 'easy', ride: 'easy' }

describe('resolveWindow', () => {
  it('tries 12 weeks, 26 weeks and 12 months', () => {
    expect(WINDOW_DAYS).toEqual([84, 182, 365])
  })

  it('honours an explicit pick without analysing anything', () => {
    for (const choice of ['all', 42, { from: '2026-01-01', to: '2026-02-01' }] as const) {
      const analysed: number[] = []
      const answer = resolveWindow(library(), choice, (selected) => {
        analysed.push(selected.length)
        return analysis({})
      })
      expect(answer).toEqual({ choice, reason: 'asked', passed: [] })
      expect(analysed).toEqual([])
    }
  })

  it('takes 12 weeks when every sport qualifies there, and analyses no other window', () => {
    const { answer, asked } = search([{}])
    expect(answer).toEqual({ choice: 84, reason: 'qualified', passed: [] })
    // Nine days of a run and a ride each.
    expect(asked).toEqual([18])
  })

  it('takes the shortest window where every sport qualifies, and says what the shorter ones lacked', () => {
    const { answer, asked } = search([RUN_EASY, { ride: 'few', run: 'easy' }, {}])
    expect(answer).toEqual({
      choice: 365,
      reason: 'qualified',
      passed: [
        { days: 84, lacks: [{ sport: 'run', lack: 'easy' }] },
        {
          days: 182,
          lacks: [
            { sport: 'run', lack: 'easy' },
            { sport: 'ride', lack: 'few' },
          ],
        },
      ],
    })
    expect(asked).toEqual([18, 38, 74])
  })

  it('names each lack: too few activities, no best of 20 min, a best shown easy', () => {
    const { answer } = search([{ run: 'few', ride: 'none' }, RUN_EASY, {}])
    expect(answer).toMatchObject({ choice: 365, reason: 'qualified' })
    expect(answer.passed[0]!.lacks).toEqual([
      { sport: 'run', lack: 'few' },
      { sport: 'ride', lack: 'none' },
    ])
    expect(answer.passed[1]!.lacks).toEqual([{ sport: 'run', lack: 'easy' }])
  })

  it('without a window that qualifies, takes the shortest with evidence for every sport and the most sports qualifying', () => {
    const { answer } = search([BOTH_EASY, RUN_EASY, RUN_EASY])
    // 26 weeks has a sport qualifying where 12 weeks has none; 12 months only ties it, so the shorter stays.
    expect(answer).toEqual({
      choice: 182,
      reason: 'most',
      passed: [
        {
          days: 84,
          lacks: [
            { sport: 'run', lack: 'easy' },
            { sport: 'ride', lack: 'easy' },
          ],
        },
      ],
    })
  })

  it('keeps 12 weeks when no window does better, after looking at all three', () => {
    const { answer, asked } = search([RUN_EASY, RUN_EASY, RUN_EASY])
    expect(answer).toEqual({ choice: 84, reason: 'most', passed: [] })
    expect(asked).toEqual([18, 38, 74])
  })

  it('never takes a window short of evidence for a sport over one that has it, however many qualify', () => {
    const { answer } = search([{ run: 'few' }, BOTH_EASY, { run: 'none' }])
    expect(answer).toMatchObject({ choice: 182, reason: 'most' })
    expect(answer.passed).toEqual([{ days: 84, lacks: [{ sport: 'run', lack: 'few' }] }])
  })

  it('uses all time when no window has evidence for every sport', () => {
    const { answer } = search([{ ride: 'few' }, { ride: 'few' }, { run: 'none' }])
    expect(answer.choice).toBe('all')
    expect(answer.reason).toBe('all-time')
    expect(answer.passed.map(({ days }) => days)).toEqual([84, 182, 365])
  })

  it('treats a window longer than the library as all time, and ends the search there', () => {
    // 200 days: 12 weeks and 26 weeks are dated, and 12 months would be the whole library.
    const { answer, asked } = search([RUN_EASY, RUN_EASY, {}], 200)
    expect(answer).toEqual({
      choice: 'all',
      reason: 'qualified',
      passed: [
        { days: 84, lacks: [{ sport: 'run', lack: 'easy' }] },
        { days: 182, lacks: [{ sport: 'run', lack: 'easy' }] },
      ],
    })
    expect(asked).toEqual([18, 38, library(200).length])
  })

  it('takes 12 weeks for a library exactly 12 weeks long, and all time for one a day shorter', () => {
    // Dated by local calendar days, so a change of clock inside the span moves nothing.
    const daysAgo = (days: number) => {
      const date = new Date(2026, 5, 1, 12)
      date.setDate(date.getDate() - days)
      return date.getTime()
    }
    const span = (days: number) =>
      [daysAgo(days), daysAgo(0)].map(
        (startMs, i) => ({ sport: SPORTS[i]!, startMs }) as ActivityDigest,
      )
    expect(resolveWindow(span(83), 'default', () => analysis({}))).toMatchObject({ choice: 84 })
    expect(resolveWindow(span(82), 'default', () => analysis({}))).toMatchObject({ choice: 'all' })
  })

  it('is all time for a library shorter than 12 weeks, whatever the search finds', () => {
    expect(search([{}], 50)).toMatchObject({
      answer: { choice: 'all', reason: 'qualified', passed: [] },
      asked: [library(50).length],
    })
    expect(search([RUN_EASY], 50).answer).toEqual({ choice: 'all', reason: 'most', passed: [] })
    expect(search([{ run: 'few' }], 50).answer).toEqual({
      choice: 'all',
      reason: 'all-time',
      passed: [],
    })
  })

  it('weighs only the sports the athlete does', () => {
    const rides = library().filter((digest) => digest.sport === 'ride')
    const answer = resolveWindow(rides, 'default', () => analysis({ run: 'few' }))
    // The analysis says the run is short, but the library holds no run to ask for.
    expect(answer).toEqual({ choice: 84, reason: 'qualified', passed: [] })
  })

  it('has no window for nothing to analyse', () => {
    expect(resolveWindow(library(), 'default', null)).toMatchObject({ choice: 'all' })
    expect(resolveWindow([], 'default', () => analysis({}))).toMatchObject({ choice: 'all' })
  })
})
