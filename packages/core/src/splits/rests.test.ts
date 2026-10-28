import { describe, expect, it } from 'vitest'
import { restSeconds, restsOf } from './rests'

/** Cumulative metres per sample at 1 Hz. */
const metres = (...values: number[]) => Float64Array.from(values)

/** A moving mask from a string: 1 is a second the device timed, 0 is one it did not. */
const mask = (text: string) => Uint8Array.from(text, (c) => (c === '1' ? 1 : 0))

const rests = (distance: Float64Array, moving: string) =>
  [...restSeconds(distance, mask(moving))].join('')

/*
 * When a file resumes, the step into the first timed sample can hold one second of running: a pause
 * held at 12 m then resumed at 16 m, with the runner at 4 m/s. That second is run, not rested, so the
 * stretch's last sample leaves the rest and the step comes off the stretch's gain. A file whose resume
 * sample is held (no step into it) has nothing to take off.
 */
describe('restSeconds', () => {
  it('marks a stretch the runner stood through, less the second of running at its end', () => {
    // Four seconds at 4 m/s, a 5 s stop with the distance held, then four more.
    const distance = metres(0, 4, 8, 12, 12, 12, 12, 12, 12, 16, 20, 24)
    expect(rests(distance, '111100000111')).toBe('000011110000')
  })

  it('marks the whole stretch when the resume sample is held, with no running second in it', () => {
    const distance = metres(0, 4, 8, 12, 12, 12, 12, 12, 12, 12, 16, 20)
    expect(rests(distance, '111100000111')).toBe('000011111000')
  })

  it('takes nothing off when the runner was still standing at the resume', () => {
    // The step after the resume sample is 0.1 m, not a second of running, so the whole stretch is
    // rest and keeps the 0.3 m it gained.
    const { rest, gain } = restsOf(metres(0, 4, 8, 8, 8.3, 8.4, 8.5), mask('1100111'))
    expect([...rest].join('')).toBe('0011000')
    expect(gain[2]! + gain[3]!).toBeCloseTo(0.3, 9)
  })

  it('marks a stretch at the start of the run, which has no sample before it', () => {
    // Not timed for the first three seconds, and the distance did not move before the step to 4 m.
    expect(rests(metres(0, 0, 0, 4, 8, 12), '000111')).toBe('110000')
    expect(rests(metres(0, 0, 0, 0, 4, 8), '000111')).toBe('111000')
  })

  it('marks a stretch that runs to the last sample, which has no sample after it', () => {
    expect(rests(metres(0, 4, 8, 8, 8), '11000')).toBe('00111')
  })

  it('marks a lone last sample, which has no seconds to measure', () => {
    const { rest, gain } = restsOf(metres(0, 4, 8), mask('110'))
    expect([...rest]).toEqual([0, 0, 1])
    expect(gain[2]).toBe(0)
  })

  it('reads a stretch that ends on the last sample by its rise alone, with nothing to take off', () => {
    // The resume sample is the last, with no step after it to read a second of running by.
    expect(rests(metres(0, 4, 8, 8, 8, 8), '110001')).toBe('001110')
    expect(rests(metres(0, 4, 8, 8, 8, 12), '110001')).toBe('000000')
  })

  it('counts a pause shorter than a step of running as a rest', () => {
    // Two seconds stopped at 4 m/s. The step into the first timed sample holds a second of running,
    // 4 m, which read over the pause is 2 m/s, a jog, when the pause gained nothing.
    expect(rests(metres(0, 4, 8, 8, 12, 16, 20), '1100111')).toBe('0010000')
  })

  it('leaves a one-sample pause to the clock when its step holds a second of running', () => {
    expect(rests(metres(0, 4, 8, 8, 12, 16, 20), '1110111')).toBe('0000000')
  })

  it('leaves a gap the distance stepped across in the clock, short or long', () => {
    // 3 s with 12 m gained across them, then the second of running at the resume.
    expect(rests(metres(0, 4, 8, 8, 24, 28, 32), '1100111')).toBe('0000000')
    // 40 s through which the runner gained 80 m, 2 m/s.
    const long = metres(0, 4, ...new Array<number>(39).fill(4), 88, 92, 96)
    expect(rests(long, '1' + '0'.repeat(40) + '111')).toBe('0'.repeat(44))
  })

  it('credits a rest with the metres a walk gained, shared over its rest seconds', () => {
    // A 10 s gap in which 4 m were walked, 0.4 m/s, then the second of running at the resume. The
    // gap's ten samples are nine seconds of rest and that second of running.
    const distance = metres(0, 4, ...new Array<number>(9).fill(4), 12, 16, 20)
    const { rest, gain } = restsOf(distance, mask('1' + '0'.repeat(10) + '111'))
    expect(rest.reduce((sum, r) => sum + r, 0)).toBe(9)
    expect(gain.reduce((sum, g) => sum + g, 0)).toBeCloseTo(4, 9)
    expect(gain[1]).toBeCloseTo(4 / 9, 9)
    expect(gain[0]).toBe(0)
    expect(gain[10]).toBe(0)
    expect(gain[12]).toBe(0)
  })

  it('does not count a stretch with a missing distance as a rest', () => {
    expect(rests(metres(0, 4, 4, Number.NaN, 8), '10011')).toBe('00000')
  })

  it('has no rests in a run the device timed throughout', () => {
    expect(rests(metres(0, 4, 8, 12), '1111')).toBe('0000')
  })
})
