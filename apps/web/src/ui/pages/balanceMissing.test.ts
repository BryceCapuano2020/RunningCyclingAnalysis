import { describe, expect, it } from 'vitest'
import type { Period } from '@rca/core/period'
import { NO_EFFORT_GATE } from '@rca/core/effort'
import { curvePoint } from '../charts/fixtures'
import { makeActivity, makeResult } from '../components/fixtures'
import { missingText } from './balanceMissing'

const ALL_TIME: Period = { choice: 'all', startMs: null, endMs: null, days: null, fellBack: false }

const PARTIAL = {
  partialImport: {
    text: 'The last import stopped before it finished, so your balance and your fitness wait.',
    action: 'Add the same files again to finish, or choose Use what I have.',
  },
}

describe('missingText for a library of one sport', () => {
  const runOnly = () => {
    const run = makeActivity({ sport: 'run' })
    return { result: makeResult({ activities: [run] }), library: [run] }
  }
  const rideOnly = () => {
    const ride = makeActivity({ sport: 'ride' })
    return { result: makeResult({ activities: [ride] }), library: [ride] }
  }
  const HELD = `${PARTIAL.partialImport.text} ${PARTIAL.partialImport.action}`

  it.each([
    ['run', runOnly, { run: 'Local', ride: null }],
    ['ride', rideOnly, { run: null, ride: 'Local' }],
  ] as const)(
    'says to finish the import, not what the %s lacks, while the import is known partial',
    (_sport, build, levels) => {
      const { result, library } = build()
      expect(missingText(result, library, ALL_TIME, levels, 0, PARTIAL).detail).toBe(HELD)
    },
  )

  it('does not say it once the import is whole', () => {
    const { result, library } = runOnly()
    expect(
      missingText(result, library, ALL_TIME, { run: 'Local', ride: null }).detail,
    ).not.toContain('Use what I have')
  })

  describe('when the sport has a level and no threshold', () => {
    const withRefusedFit = () => {
      const ride = makeActivity({ sport: 'ride' })
      return {
        result: makeResult({ activities: [ride], rideCp: null, rideCpRefusal: 'shape' }),
        library: [ride],
      }
    }

    it('shows the level without asking for a harder effort', () => {
      const { result, library } = withRefusedFit()
      const missing = missingText(result, library, ALL_TIME, { run: null, ride: 'Recreational' })
      expect(missing.title).toContain('Recreational')
      expect(missing.detail).toBe('')
    })

    it('asks only for what the effort gate asks when the level rests on a best that was not shown hard', () => {
      const { result, library } = withRefusedFit()
      const gated = {
        ...result,
        effortGate: {
          ...result.effortGate,
          ride: {
            ...NO_EFFORT_GATE,
            verdict: 'notHard' as const,
            unchecked: null,
            share: 0.8,
            reference: 'trusted' as const,
          },
        },
      }
      const missing = missingText(gated, library, ALL_TIME, { run: null, ride: 'Recreational' })
      expect(missing.detail).toMatch(
        /^A 20 min effort at 90% or more of it would confirm the level\.$/,
      )
      expect(missing.detail).not.toContain('Needs')
    })

    it('asks for nothing while the sport has no level to show but has a best: its tile shows a floor', () => {
      const { result, library } = withRefusedFit()
      const withBest = { ...result, rideMetabolicCurve: [curvePoint(1200, 3.0, 'ride-1')] }
      const missing = missingText(withBest, library, ALL_TIME, { run: null, ride: null })
      expect(missing.title).toBe('Your cycling so far')
      expect(missing.detail).toBe('')
    })

    it('asks for one effort while the sport holds no best to show', () => {
      const { result, library } = withRefusedFit()
      const missing = missingText(result, library, ALL_TIME, { run: null, ride: null })
      expect(missing.title).toBe('Your cycling so far')
      expect(missing.detail).toBe('Needs an effort of 20 min or longer')
    })
  })
})
