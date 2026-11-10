import { describe, expect, it } from 'vitest'
import { setText } from './liftSetText'

const plain = (text: string) => text.replaceAll('\u00a0', ' ').replaceAll('\u2060', '')

describe('setText', () => {
  it('writes a loaded set as load times reps', () => {
    expect(plain(setText({ key: 'a', reps: 5, loadKg: 100 }, 'barbell', 'metric'))).toBe(
      '100 kg × 5',
    )
  })

  it('writes a bodyweight set as bodyweight, and added load as added to it', () => {
    expect(plain(setText({ key: 'a', reps: 10, loadKg: 0 }, 'bodyweight', 'metric'))).toBe(
      'Bodyweight × 10',
    )
    expect(plain(setText({ key: 'a', reps: 15, loadKg: 20 }, 'bodyweight', 'metric'))).toBe(
      'Bodyweight + 20 kg × 15',
    )
  })

  it('adds the effort and the warm-up mark', () => {
    expect(
      plain(setText({ key: 'a', reps: 5, loadKg: 60, rpe: 8, warmup: true }, 'barbell', 'metric')),
    ).toBe('60 kg × 5 · RPE 8 · warm-up')
  })
})
