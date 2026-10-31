import { describe, expect, it } from 'vitest'
import type { Period } from '@rca/core/period'
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

    it('shows the level without asking for a harder effort: the threshold tile says what it needs', () => {
      const { result, library } = withRefusedFit()
      const missing = missingText(result, library, ALL_TIME, { run: null, ride: 'Recreational' })
      expect(missing.title).toContain('Recreational')
      expect(missing.detail).toBe('')
    })

    it('asks for what the threshold needs while the sport has no level to show', () => {
      const { result, library } = withRefusedFit()
      const missing = missingText(result, library, ALL_TIME, { run: null, ride: null })
      expect(missing.title).toBe('Your cycling so far')
      expect(missing.detail).toBe('Needs a harder effort between 3 and 20 min')
    })
  })
})
