import '../test/warmSample'
import { describe, expect, it } from 'vitest'
import { digestActivity } from '@rca/core/digest'
import type { PeriodChoice } from '@rca/core/period'
import { AnalysisSession } from '@rca/core/session'
import { DEFAULT_ATHLETE, generateActivity } from '@rca/core/synthetic'
import type { ActivitySpec, SyntheticAthlete } from '@rca/core/synthetic'
import type { Sport } from '@rca/core/types'
import { gapOfHeadline } from './balanceGap'
import { headlineGrades } from './grades'
import type { AgeProfile } from './grades'

/*
 * How far the Balance verdict moves with the period chip and the body mass typed in, on one synthetic athlete: a runner
 * who was fitter for eight months, a year and a bit ago, riding as before, analysed under three body masses (the
 * athlete is generated at 75 kg). The verdict is a centre rule (`leanOfLead`: a lead within two points is even), so
 * a lead of a few points sits close to the line and a period or a few kilograms can carry it across.
 *
 * The table is pinned so that a flip is a product decision: a change that moves any cell fails here, and whoever
 * moves it re-pins the table and says in the description why (the audit's RCA-002 asks for exactly that). Each
 * cell is the running lead in whole age-grade points and the lean it gives.
 */

const PROFILE: AgeProfile = { birthYear: 1988, sex: 'male' }
const FIRST_MS = Date.UTC(2023, 0, 7, 8)
const DAY_MS = 86_400_000
const MONTHS = 30

function activity(sport: Sport, month: number, athlete: SyntheticAthlete) {
  const spec: ActivitySpec = {
    id: `${sport}-${month}`,
    name: `${sport} ${month}`,
    sport,
    startMs: FIRST_MS + month * 30 * DAY_MS + (sport === 'ride' ? 2 * DAY_MS : 0),
    durationS: 3000,
    effort: 'test',
    terrain: 'flat',
    withPower: true,
  }
  return digestActivity(generateActivity(athlete, spec, month * 2 + (sport === 'ride' ? 1 : 0) + 1))
}

function library() {
  return Array.from({ length: MONTHS }, (_, month) => {
    const runner: SyntheticAthlete = {
      ...DEFAULT_ATHLETE,
      cpRun: month >= 14 && month < 22 ? 18.5 : DEFAULT_ATHLETE.cpRun,
    }
    return [activity('run', month, runner), activity('ride', month, DEFAULT_ATHLETE)]
  }).flat()
}

const PERIODS: PeriodChoice[] = ['default', 90, 365, 'all']

/** body mass, then per period the running lead and its lean. */
const PINNED: Record<number, Record<string, string>> = {
  70: { default: '-1 even', '90': '-1 even', '365': '5 run', all: '5 run' },
  75: { default: '0 even', '90': '0 even', '365': '6 run', all: '6 run' },
  80: { default: '9 run', '90': '9 run', '365': '15 run', all: '15 run' },
}

describe('the Balance verdict against the period chip and the typed body mass', () => {
  it('is the pinned table, so a flip of the lean is a deliberate change', () => {
    const digests = library()
    const found: Record<number, Record<string, string>> = {}
    for (const massKg of Object.keys(PINNED).map(Number)) {
      const settings = { massKg, bikeMassKg: 9 }
      const session = new AnalysisSession()
      session.loadDigests(digests, settings)
      found[massKg] = {}
      for (const choice of PERIODS) {
        const state = session.setRange(choice, settings)
        const gap =
          state.result === null ? null : gapOfHeadline(headlineGrades(state.result, PROFILE))
        found[massKg]![String(choice)] = gap === null ? 'none' : `${gap.centre} ${gap.lean}`
      }
    }
    expect(found).toEqual(PINNED)
  })

  it('moves with the period and with five kilograms, which is why it is pinned', () => {
    const leans = new Set(Object.values(PINNED).flatMap((row) => Object.values(row)))
    const verdicts = new Set([...leans].map((cell) => cell.split(' ')[1]))
    // Both facts the audit found are in the table: the lean changes with the chip (even to run at 70 kg) and with the
    // weight (even at 75 kg, run at 80 kg).
    expect(verdicts).toEqual(new Set(['even', 'run']))
    expect(PINNED[75]!['default']).not.toBe(PINNED[80]!['default'])
    expect(PINNED[70]!['default']!.split(' ')[1]).not.toBe(PINNED[70]!['365']!.split(' ')[1])
  })
})
