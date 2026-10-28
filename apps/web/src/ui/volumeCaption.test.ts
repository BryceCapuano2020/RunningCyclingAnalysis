import { describe, expect, it } from 'vitest'
import { volumeCaption } from './volumeCaption'
import type { VolumeWeek } from './weeklyVolume'

const HOUR = 3600

/** Weeks of [run hours, ride hours], dated by position. */
function weeksOf(...hours: [number, number][]): VolumeWeek[] {
  return hours.map(([run, ride], i) => ({
    endMs: i,
    seconds: { run: run * HOUR, ride: ride * HOUR },
  }))
}

describe('volumeCaption', () => {
  it('names the sport whose share of the hours rose most between the halves', () => {
    const weeks = weeksOf([5, 1], [5, 1], [4, 2], [1, 5], [1, 5], [1, 4])
    expect(volumeCaption(weeks)).toBe(
      'Cycling rose from 22% of your hours in the first half to 82% in the second.',
    )
  })

  it('names the rise rather than the fall when the two are as large', () => {
    const weeks = weeksOf([9, 1], [9, 1], [1, 1], [1, 1])
    expect(volumeCaption(weeks)).toBe(
      'Cycling rose from 10% of your hours in the first half to 50% in the second.',
    )
  })

  it('names the rise when the rise and the fall differ only by floating-point noise', () => {
    const weeks = weeksOf([1, 2], [1, 2], [2, 1], [2, 1])
    expect(volumeCaption(weeks)).toBe(
      'Running rose from 33% of your hours in the first half to 67% in the second.',
    )
    expect(volumeCaption(weeksOf([0.7, 0.3], [0.7, 0.3], [0.3, 0.7], [0.3, 0.7]))).toBe(
      'Cycling rose from 30% of your hours in the first half to 70% in the second.',
    )
  })

  it('gives the share of the hours when neither sport moved by 15 points', () => {
    const weeks = weeksOf([4, 2], [3, 2], [4, 2], [4, 3], [4, 2], [3, 2])
    expect(volumeCaption(weeks)).toBe('Running was 63% of your hours over these weeks.')
  })

  it('gives the share when one half holds no training, since a share needs hours', () => {
    const weeks = weeksOf([0, 0], [0, 0], [3, 3], [3, 3])
    expect(volumeCaption(weeks)).toBe('Running was 50% of your hours over these weeks.')
  })

  it('reads the hours of a single sport as a change between the halves when they moved by a quarter', () => {
    const weeks = weeksOf([2, 0], [2, 0], [2, 0], [4, 0], [4, 0], [4, 0])
    expect(volumeCaption(weeks)).toBe(
      'Running rose from 2.0 h a week in the first half to 4.0 h in the second.',
    )
    expect(volumeCaption(weeksOf([4, 0], [4, 0], [4, 0], [2, 0], [2, 0], [2, 0]))).toBe(
      'Running fell from 4.0 h a week in the first half to 2.0 h in the second.',
    )
  })

  it('gives the average when a lone sport’s first half is under half an hour a week', () => {
    expect(volumeCaption(weeksOf([0.4, 0], [0.4, 0], [2, 0], [2, 0]))).toBe(
      'Running averaged 1.2 h a week over these weeks.',
    )
  })

  it('gives a single sport’s average when its weekly hours held steady', () => {
    expect(volumeCaption(weeksOf([3, 0], [4, 0], [4, 0], [3, 0]))).toBe(
      'Running averaged 3.5 h a week over these weeks.',
    )
  })

  it('names the sport that has the hours, whichever sport that is', () => {
    expect(volumeCaption(weeksOf([0, 3], [0, 3], [0, 3]))).toBe(
      'Cycling averaged 3.0 h a week over these weeks.',
    )
  })

  it('keeps clear of words the app does not use', () => {
    const lines = [
      volumeCaption(weeksOf([5, 1], [5, 1], [1, 5], [1, 5])),
      volumeCaption(weeksOf([4, 2], [4, 2], [4, 2])),
      volumeCaption(weeksOf([2, 0], [4, 0], [6, 0])),
    ].join(' ')
    expect(lines).not.toMatch(/limiter|weak|strength|holding you back|ahead of/i)
  })
})
