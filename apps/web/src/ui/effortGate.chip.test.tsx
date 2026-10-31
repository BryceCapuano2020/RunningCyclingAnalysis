// @vitest-environment jsdom
import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { EffortCheck } from '@rca/core/types'
import { effortCaveat, effortChipText } from './effortCaveat'

afterEach(cleanup)

describe('the chip when the reference cannot show an effort was hard', () => {
  const check = (reference: EffortCheck['runReference'], share = 0.98): EffortCheck => ({
    durationS: HEADLINE_DURATION_S,
    runHrFraction: share,
    rideHrFraction: null,
    runReference: reference,
    rideReference: null,
  })

  it('says a share of a trusted reference, and no more than the share shows', () => {
    const close = effortChipText('run', check('trusted'))!
    expect(close).toMatchObject({ hard: true, label: 'Hard effort · 98%' })
    expect(close.detail).toContain(': close to your highest heart rate.')
    expect(close.detail).not.toContain('so it was hard')
    const within = effortChipText('run', check('trusted', 0.92))!
    expect(within.detail).toContain(
      ': within 10% of your highest heart rate. Heart rate cannot tell a hard 20 min from an all-out one.',
    )
  })

  it('names the maximum the athlete entered, or the age it was worked out from, as the reference', () => {
    const entered = effortChipText('run', { ...check('trusted'), runReferenceSource: 'entered' })!
    expect(entered.detail).toContain('(the max heart rate you entered)')
    expect(entered.detail).toContain('close to your max heart rate')
    const age = effortChipText('run', { ...check('trusted'), runReferenceSource: 'age' })!
    expect(age.detail).toContain('(estimated from your age)')
  })

  it('never says close to a max for a reference worked out from the age, which people differ from by about 10 bpm', () => {
    const chip = effortChipText('run', { ...check('trusted'), runReferenceSource: 'age' })!
    expect(chip.detail).toContain(': close to your age-predicted max (±10 bpm).')
    expect(chip.detail).not.toContain('close to your max heart rate')
    const within = effortChipText('run', { ...check('trusted', 0.92), runReferenceSource: 'age' })!
    expect(within.detail).toContain('within 10% of your age-predicted max (±10 bpm)')
  })

  it('says what a share under the line is and promises no effort that could not settle it', () => {
    const chip = effortChipText('run', check('trusted', 0.82))!
    expect(chip.detail).toContain('reached 82%')
    expect(chip.detail).toContain('That is under the 90% that marks a hard effort.')
    expect(chip.detail).not.toContain('would raise')
  })

  it('says the check at the duration it is of, not only at 20 minutes', () => {
    const at600 = effortChipText('run', { ...check('trusted', 0.82), durationS: 600 })!
    expect(at600.detail).toContain('Your best 10 min running reached 82%')
  })

  it('does not call a best hard, or print its share, when the reference is low or where the typical day is', () => {
    for (const reference of ['low', 'habitual'] as const) {
      const chip = effortChipText('run', check(reference))!
      expect(chip.hard).toBe(false)
      expect(chip.label).toBe('Effort not confirmed')
      expect(chip.detail).toContain('cannot show your best 20 min was hard')
      expect(chip.detail).toContain('Set your max heart rate in Profile')
      expect(chip.detail).not.toContain('98%')
      expect(chip.detail).not.toContain('A hard 20 min effort would')
    }
  })

  it('asks a reference far above the age band to be confirmed, not a harder effort', () => {
    const chip = effortChipText('run', check('high'))!
    expect(chip.label).toBe('Effort not confirmed')
    expect(chip.detail).toContain('far above the usual maximum for your age')
    expect(chip.detail).toContain('enter it as your max heart rate in Profile')
  })

  it('says the effort was not checked where too few days have a heart rate', () => {
    const chip = effortChipText('run', check('thin'))!
    expect(chip).toMatchObject({ hard: false, label: 'Effort not checked' })
    expect(chip.detail).toContain('too few days with heart rate')
    expect(effortCaveat(check('thin'))?.short).toBe(
      'Effort not checked: too few days with heart rate.',
    )
  })

  it('gives the share card a line that heart rate does not show the efforts were hard', () => {
    expect(effortCaveat(check('low'))?.short).toBe(
      'Heart rate does not show the best efforts over 20 min were hard.',
    )
    expect(effortCaveat(check('trusted'))).toBeNull()
  })
})
