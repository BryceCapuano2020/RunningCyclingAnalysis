import { describe, expect, it } from 'vitest'
import { leanOfLead } from '../../domain/lean'
import { balanceMoveItem } from '../analysis/balanceMove'
import { gapReading } from './balanceScale'
import { balanceSentence, rangeText } from './headlineText'
import { triangleLine } from '../pages/triangleCopy'
import { triangleReading } from '@rca/core/standing'
import { viewOfGap } from '../test/triangleView'

const gap = (centre: number, low: number, high: number) => ({
  centre,
  low,
  high,
  lean: leanOfLead({ centre, low, high }),
})

/** The line under the headline for a gap, from the grades that give it. */
const lineOf = (centre: number, low: number, high: number) =>
  triangleLine(triangleReading(viewOfGap({ centre, low, high }).grades))

describe('every surface writes a balance from the same side', () => {
  // A level balance that favours cycling by 2 points, its range reaching 6 points toward cycling and 2 toward running.
  const reading = gapReading(gap(-2, -6, 2))
  const RANGE = '−2 to +6 points'

  it('writes the cycling side in the lede, and of the range in the range text and the spoken sentence', () => {
    expect(reading.lean).toBe('even')
    expect(rangeText(reading)).toBe(RANGE)
    expect(lineOf(-2, -6, 2)).toBe('Cycling grades 2 points higher.')
    expect(balanceSentence(reading)).toBe(`In balance: cycling 2 points higher, range ${RANGE}`)
  })

  it('writes it the same way in the import summary', () => {
    const after = gapReading(gap(-1, -5, 3))
    const item = balanceMoveItem(reading, after, null)
    expect(item?.text).toContain('range was −2 to +6 points and is now −3 to +5 points')
    expect(item?.text).toContain('2 points toward cycling')
    expect(item?.text).toContain('1 point toward cycling')
  })

  it('says the two grade the same for an estimate of zero, with no range to print', () => {
    expect(lineOf(0, 0, 0)).toBe('Running and cycling grade the same.')
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
