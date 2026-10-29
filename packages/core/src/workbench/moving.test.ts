import { describe, expect, it } from 'vitest'
import { isMovingSecond } from './moving'

const mask = (text: string) => Uint8Array.from(text, (c) => (c === '1' ? 1 : 0))

describe('isMovingSecond', () => {
  it('is true only for a second that is neither paused nor unrecorded', () => {
    const trace = { paused: mask('0011'), unrecorded: mask('0101') }
    expect([0, 1, 2, 3].map((i) => isMovingSecond(trace, i))).toEqual([true, false, false, false])
  })
})
