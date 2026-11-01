import { describe, expect, it } from 'vitest'
import { HEADLINE_DURATION_S } from '../constants'
import { metabolicToFlatSpeed } from '../metabolic'
import { AnalysisSession } from '../session'
import type { ActivityDigest } from '../types'
import { historyOf, NO_HISTORY } from './compute'
import { balanceLibrary, copyOf, REFERENCE, SETTINGS, TWELVE_YEARS } from './test/balanceLibrary'
import type { HistoryInput } from './types'
import { speedOfBest } from './balance'

const INPUT: HistoryInput = {
  settings: SETTINGS,
  setAside: new Set<string>(),
  nowMs: Date.UTC(2030, 0, 1),
  gate: null,
  effortReference: REFERENCE,
}
const rowsOf = (digests: ActivityDigest[], input: HistoryInput = INPUT) =>
  historyOf(digests, input).balance

describe('balance', () => {
  const rows = rowsOf(balanceLibrary(TWELVE_YEARS))

  it('has a row for each year with a best, none for a year without one, and a null for a sport that did not train', () => {
    expect(rows.map((row) => row.year)).toEqual([
      2013, 2014, 2015, 2016, 2017, 2019, 2020, 2021, 2022, 2023, 2024,
    ])
    const lone = rows.find((row) => row.year === 2016)!
    expect(lone.sports.ride).toBeNull()
    expect(lone.sports.run).not.toBeNull()
    expect(rows.every((row) => row.year === 2016 || row.sports.ride !== null)).toBe(true)
  })

  it('carries a ride’s range and no range for a run, and the day of the activity that set each best', () => {
    const row = rows.find((candidate) => candidate.year === 2020)!
    expect(row.sports.run!.range).toBeNull()
    const [low, high] = row.sports.ride!.range!
    expect(low).toBeLessThan(row.sports.ride!.speed)
    expect(high).toBeGreaterThan(row.sports.ride!.speed)
    expect(row.sports.run!.startMs).toBe(Date.UTC(2020, 5, 10, 12))
    expect(row.sports.ride!.startMs).toBe(Date.UTC(2020, 5, 12, 12))
  })

  it('judges each year’s best 20 minutes: hard at the reference, not hard under it, unknown without a reference', () => {
    const verdicts = (input: HistoryInput) =>
      rowsOf(balanceLibrary(TWELVE_YEARS), input).map((row) => row.sports.ride?.verdict)
    // The ride's 20 minute heart rate is 120 bpm in the years 2013, 2016 (no ride), 2019 and 2022.
    const judged = verdicts(INPUT)
    expect(judged).toEqual([
      'notHard',
      'hard',
      'hard',
      undefined,
      'hard',
      'notHard',
      'hard',
      'hard',
      'notHard',
      'hard',
      'hard',
    ])
    const { effortReference: _dropped, ...unjudged } = INPUT
    expect(new Set(verdicts(unjudged))).toEqual(new Set(['unknown', undefined]))
  })

  it('is empty for an empty library and for a library with no 20 minute effort', () => {
    expect(rowsOf([])).toEqual(NO_HISTORY.balance)
    const short = copyOf('run', 'short', Date.UTC(2020, 5, 1), { scale: 1 })
    const noTwenty = {
      ...short,
      curve: short.curve.filter((p) => p.durationS < HEADLINE_DURATION_S),
    }
    expect(rowsOf([noTwenty])).toEqual([])
  })

  it('is remembered for the same digests, and made again when the references or the calibration change', () => {
    const library = balanceLibrary(TWELVE_YEARS)
    const first = historyOf(library, INPUT)
    expect(historyOf([...library], { ...INPUT, nowMs: INPUT.nowMs + 1 }).balance).toBe(
      first.balance,
    )
    expect(
      historyOf(library, { ...INPUT, calibration: { kappa: 1.1, lnKappaSe: 0.2 } as never })
        .balance,
    ).not.toBe(first.balance)
    const lower = { ...REFERENCE, referenceHr: { run: 175, ride: 175 } }
    expect(historyOf(library, { ...INPUT, effortReference: lower }).balance).not.toBe(first.balance)
  })
})

describe('balance against the hero of an equal window', () => {
  const library = balanceLibrary(TWELVE_YEARS)
  const session = new AnalysisSession()
  session.loadDigests(library, SETTINGS)
  const rows = session.setRange('all', SETTINGS).history.balance

  it('reads the same speed, range, day and verdict as the analysis of that year alone', () => {
    for (const row of rows) {
      const state = session.setRange(
        { from: `${row.year}-01-01`, to: `${row.year}-12-31` },
        SETTINGS,
      )
      const result = state.result!
      const run = result.runCurve.find((p) => p.durationS === HEADLINE_DURATION_S)
      const ride = result.equivalents.find((e) => e.durationS === HEADLINE_DURATION_S)
      expect(row.sports.run === null).toBe(run === undefined || !Number.isFinite(run.value))
      if (row.sports.run !== null) {
        expect(row.sports.run.speed).toBe(metabolicToFlatSpeed(run!.value))
        expect(row.sports.run.verdict).toBe(result.effortGate.run.verdict)
      }
      expect(row.sports.ride === null).toBe(ride === undefined)
      if (row.sports.ride !== null) {
        expect(speedOfBest(row.sports.ride)).toEqual(ride!.runSpeed)
        expect(row.sports.ride.verdict).toBe(result.effortGate.ride.verdict)
      }
    }
  })
})
