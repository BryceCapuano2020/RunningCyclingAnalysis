import { describe, expect, it } from 'vitest'
import { fitnessLines } from '@rca/core/fitness'
import type { FitnessStatus } from '@rca/core/fitness'
import type { UnitSystem } from '@rca/core/units'
import { FITNESS_AS_OF_MS, RIDE_SLIPPING, SLIPPING, waitingStatus } from './test/fitnessFixtures'
import { viewOf } from './fitnessModel'
import { fitnessRows } from './fitnessRows'

/** A row's value by its label, or null. */
const valueOf = (rows: ReturnType<typeof fitnessRows>, label: RegExp) =>
  rows.find((row) => label.test(row.label))?.value ?? null

describe('fitnessRows prints the figures of the lines', () => {
  const history = { kind: 'history', have: 7, need: 12, weeks: 5, needWeeks: 8 } as const
  const cases: [string, FitnessStatus][] = [
    ['a run that calls a state', SLIPPING],
    ['a ride that calls a state', RIDE_SLIPPING],
    ['a run that cannot call a trend', waitingStatus(history, 7)],
    ['a ride that cannot call a trend', waitingStatus(history, 7, 'ride')],
  ]

  it.each(cases)(
    'says %s with the level, range and count the line source gives',
    (_name, status) => {
      for (const units of ['metric', 'imperial'] as UnitSystem[]) {
        const lines = fitnessLines(status, units)
        const rows = fitnessRows(viewOf(status, units, FITNESS_AS_OF_MS), units, {
          level: true,
          warm: false,
        })
        // The level is the line's first figure, before " at N bpm".
        expect(lines.headline.startsWith(String(valueOf(rows, / at \d+ bpm$/)))).toBe(true)
        // A range is the one in the line's brackets, with its unit after it.
        const range = valueOf(rows, /^Range$/)
        if (range !== null)
          expect(lines.headline).toContain(`(${String(range).replace(/ \S+$/, '')})`)
        // The count is the one the support line says.
        expect(lines.support).toContain(
          `From ${String(valueOf(rows, /^Steady (runs|rides)$/))} steady`,
        )
      }
    },
  )
})
