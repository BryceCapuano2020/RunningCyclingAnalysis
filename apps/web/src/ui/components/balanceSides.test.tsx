// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { leanOfLead } from '../../domain/lean'
import { balanceMoveItem } from '../analysis/balanceMove'
import { BalanceMeter } from './BalanceMeter'
import { gapReading } from './balanceScale'
import { balanceSentence, balanceSummary, rangeText } from './headlineText'

afterEach(cleanup)

const gap = (centre: number, low: number, high: number) => ({
  centre,
  low,
  high,
  lean: leanOfLead({ centre, low, high }),
})

describe('every surface writes a balance from the same side', () => {
  // A level balance that favours cycling by 2 points, its range reaching 6 points toward cycling and 2 toward running.
  const reading = gapReading(gap(-2, -6, 2))
  const RANGE = '−2 to +6 points'

  it('writes the cycling side of the range in the lede, the range text, the key and the spoken sentence', () => {
    expect(reading.lean).toBe('even')
    expect(rangeText(reading)).toBe(RANGE)
    expect(balanceSummary(reading, 1200)).toContain(`Cycling’s age grade is 2 points higher`)
    expect(balanceSummary(reading, 1200)).toContain(`within ${RANGE}`)
    expect(balanceSentence(reading)).toBe(`In balance: cycling 2 points higher, range ${RANGE}`)
    const { container } = render(<BalanceMeter reading={reading} />)
    expect(container.querySelector('.balance-meter__key')?.textContent).toContain(RANGE)
  })

  it('writes it the same way in the import summary', () => {
    const after = gapReading(gap(-1, -5, 3))
    const item = balanceMoveItem(reading, after, null)
    expect(item?.text).toContain('range was −2 to +6 points and is now −3 to +5 points')
    expect(item?.text).toContain('2 points toward cycling')
    expect(item?.text).toContain('1 point toward cycling')
  })

  it('keeps the running side, labelled, only for an estimate of zero with a lopsided range', () => {
    const zero = gapReading(gap(0, -2, 6))
    expect(balanceSummary(zero, 1200)).toContain('within −2 to +6 points (running minus cycling)')
    expect(balanceSummary(gapReading(gap(-2, -6, 2)), 1200)).not.toContain('running minus cycling')
  })

  it('never prints a range of 0 to 0 for an estimate of zero with no range', () => {
    expect(balanceSummary(gapReading(gap(0, 0, 0)), 1200)).toBe(
      'Running and cycling have the same age grade at 20 min, so the two are level.',
    )
  })

  it('signs a range that touches zero', () => {
    expect(rangeText(gapReading(gap(5, 0, 8)))).toBe('0 to +8 points')
  })
})

describe('leanOfLead rounds by size', () => {
  it('treats −2.5 and +2.5 alike', () => {
    expect(leanOfLead({ centre: 2.5, low: 0, high: 5 })).toBe('run')
    expect(leanOfLead({ centre: -2.5, low: -5, high: 0 })).toBe('ride')
    expect(leanOfLead({ centre: -2.4, low: -5, high: 0 })).toBe('even')
  })
})
