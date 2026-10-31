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
  const levels = { run: 'Local', ride: 'Local' }

  it('asks for a ride when only runs are on file', () => {
    const { result, library } = runOnly()
    expect(missingText(result, library, ALL_TIME, { run: 'Local', ride: null }).detail).toBe(
      'Add a ride to compare it with your running.',
    )
  })

  it('does not ask for a ride while the import is known partial: the ride may be in the files not read', () => {
    const { result, library } = runOnly()
    expect(
      missingText(result, library, ALL_TIME, { run: 'Local', ride: null }, 0, PARTIAL).detail,
    ).toBe(`${PARTIAL.partialImport.text} ${PARTIAL.partialImport.action}`)
  })

  it('says the same for a library of rides, and asks for a run when the import is whole', () => {
    const { result, library } = rideOnly()
    expect(missingText(result, library, ALL_TIME, { run: null, ride: levels.ride }).detail).toBe(
      'Add a run to compare it with your cycling.',
    )
    expect(
      missingText(result, library, ALL_TIME, { run: null, ride: levels.ride }, 0, PARTIAL).detail,
    ).toBe(`${PARTIAL.partialImport.text} ${PARTIAL.partialImport.action}`)
  })
})
