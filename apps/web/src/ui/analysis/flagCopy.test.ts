import { describe, expect, it } from 'vitest'
import { flagSentence, skippedReadingsText } from './flagCopy'

describe('flagSentence: a data issue in plain words', () => {
  it('says the heart rate looked too low for the power, with the span in clock time and in words', () => {
    expect(flagSentence({ kind: 'hr-implausible-for-power', start: 2261, end: 2419 })).toBe(
      'Heart rate looked too low for your power from 37:41 to 40:19. We left those 2 min 38 s out.',
    )
  })

  it('names each kind of sensor problem without the engine wording', () => {
    expect(flagSentence({ kind: 'hr-dropout', start: 60, end: 90 })).toBe(
      'Heart rate was missing or too low while moving from 1:00 to 1:30. We left those 30 s out.',
    )
    expect(flagSentence({ kind: 'power-dropout', start: 0, end: 60 })).toBe(
      'The power meter stopped reporting while moving from 0:00 to 1:00. We left those 1 min out.',
    )
    expect(flagSentence({ kind: 'power-spike', start: 5, end: 6 })).toBe(
      'The power meter reported an impossible spike from 0:05 to 0:06. We left those 1 s out.',
    )
    expect(flagSentence({ kind: 'speed-spike', start: 10, end: 12 })).toBe(
      'GPS speed jumped to an impossible value from 0:10 to 0:12. We left those 2 s out.',
    )
    expect(flagSentence({ kind: 'hr-spike', start: 10, end: 11 })).toBe(
      'Heart rate jumped to an impossible value from 0:10 to 0:11. We left those 1 s out.',
    )
  })

  it('says where an altitude jump happened, and that nothing was left out for it', () => {
    expect(flagSentence({ kind: 'altitude-jump', start: 754, end: 755 })).toBe(
      'Altitude jumped in a single second at 12:34.',
    )
  })

  it('says what a missing altitude stopped using, for the span it covers', () => {
    expect(flagSentence({ kind: 'missing-altitude', start: 0, end: 120 })).toBe(
      'No altitude was recorded from 0:00 to 2:00, so grade-based figures for that stretch are not used.',
    )
  })

  it('writes an hour as h:mm:ss in its clock time', () => {
    expect(flagSentence({ kind: 'power-spike', start: 3600, end: 3601 })).toContain(
      'from 1:00:00 to 1:00:01',
    )
  })

  it('keeps the words the app avoids out of every sentence', () => {
    const kinds = [
      'hr-dropout',
      'hr-spike',
      'hr-implausible-for-power',
      'power-spike',
      'power-dropout',
      'speed-spike',
      'altitude-jump',
      'missing-altitude',
    ] as const
    const all = kinds.map((kind) => flagSentence({ kind, start: 1, end: 2 })).join(' ')
    for (const word of ['worker', 'limiter', 'weak', 'strength', 'holding you back', 'ahead of']) {
      expect(all).not.toContain(word)
    }
  })
})

describe('skippedReadingsText', () => {
  it('counts the readings left out, in the singular for one', () => {
    expect(skippedReadingsText(1)).toBe('1 reading skipped')
    expect(skippedReadingsText(2)).toBe('2 readings skipped')
  })
})
