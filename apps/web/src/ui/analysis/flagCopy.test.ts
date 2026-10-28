import { describe, expect, it } from 'vitest'
import {
  flagKindSentence,
  flagSpanText,
  skippedKinds,
  skippedReadings,
  skippedReadingsText,
} from './flagCopy'

describe('flagKindSentence: one line for each kind of reading', () => {
  it('says how many times a kind happened, and that its readings were left out', () => {
    expect(flagKindSentence('hr-dropout', 4)).toBe(
      'Heart rate was missing or too low while moving 4 times. We left those out of your figures.',
    )
  })

  it('groups the count of times from a thousand on', () => {
    expect(flagKindSentence('hr-dropout', 1204)).toBe(
      'Heart rate was missing or too low while moving 1,204 times. We left those out of your figures.',
    )
  })

  it('says once for one reading, and that the one was left out', () => {
    expect(flagKindSentence('speed-spike', 1)).toBe(
      'GPS speed jumped suddenly once. We left that out of your figures.',
    )
  })

  it('names each kind of sensor problem in plain words', () => {
    expect(flagKindSentence('hr-implausible-for-power', 2)).toContain(
      'Heart rate looked too low for your power 2 times.',
    )
    expect(flagKindSentence('power-dropout', 2)).toContain(
      'The power meter stopped reporting while moving 2 times.',
    )
    expect(flagKindSentence('power-spike', 2)).toContain(
      'The power meter reported a sudden spike 2 times.',
    )
    expect(flagKindSentence('hr-spike', 2)).toContain('Heart rate jumped suddenly 2 times.')
  })

  it('says an altitude jump leaves the climb and the slope-based figures near it out of the figures', () => {
    expect(flagKindSentence('altitude-jump', 2)).toBe(
      'Altitude jumped in a single second 2 times. We left the climb and the slope-based figures near each jump out of your figures.',
    )
    expect(flagKindSentence('altitude-jump', 1)).toBe(
      'Altitude jumped in a single second once. We left the climb and the slope-based figures near that jump out of your figures.',
    )
  })

  it('says an implausible climb leaves the slope-based figures there out of the figures', () => {
    expect(flagKindSentence('implausible-climb', 1)).toBe(
      'Altitude rose faster than anyone can climb once. We left the slope-based figures there out of your figures.',
    )
    expect(flagKindSentence('implausible-climb', 2)).toBe(
      'Altitude rose faster than anyone can climb 2 times. We left the slope-based figures at those times out of your figures.',
    )
    expect(flagSpanText({ kind: 'implausible-climb', start: 754, end: 799 })).toBe(
      'from 12:34 to 13:19, 45 s',
    )
  })

  it('says where speed and distance disagreed, only what both support was counted', () => {
    expect(flagKindSentence('stream-disagreement', 1)).toBe(
      'Speed and distance disagreed once. We counted only what both support there.',
    )
    expect(flagKindSentence('stream-disagreement', 3)).toBe(
      'Speed and distance disagreed 3 times. We counted only what both support at those times.',
    )
  })

  it('says a missing altitude is one note for the whole activity, and that its climb figures are not shown', () => {
    const note = 'No altitude was recorded, so climb and slope-based figures are not shown.'
    expect(flagKindSentence('missing-altitude', 1)).toBe(note)
    expect(flagKindSentence('missing-altitude', 3)).toBe(note)
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
      'implausible-climb',
      'stream-disagreement',
      'missing-altitude',
    ] as const
    const all = kinds.map((kind) => flagKindSentence(kind, 2)).join(' ')
    for (const word of [
      'worker',
      'limiter',
      'weak',
      'strength',
      'holding you back',
      'ahead of',
      'impossible',
    ]) {
      expect(all).not.toContain(word)
    }
  })
})

describe('flagSpanText: where one reading sits, under its kind', () => {
  it('gives the span in clock time, and the time it covers in words', () => {
    expect(flagSpanText({ kind: 'hr-implausible-for-power', start: 2261, end: 2419 })).toBe(
      'from 37:41 to 40:19, 2 min 38 s',
    )
  })

  it('writes an hour as h:mm:ss in its clock time', () => {
    expect(flagSpanText({ kind: 'power-spike', start: 3600, end: 3601 })).toBe(
      'from 1:00:00 to 1:00:01, 1 s',
    )
  })

  it('says where an altitude jump happened, since it has no span to cover', () => {
    expect(flagSpanText({ kind: 'altitude-jump', start: 754, end: 755 })).toBe('at 12:34')
  })
})

describe('skippedReadings: the readings left out of the figures', () => {
  it('counts the readings of kinds that remove samples, and no altitude note', () => {
    expect(skippedReadings({ 'hr-dropout': 3, 'altitude-jump': 2, 'missing-altitude': 1 })).toBe(3)
  })

  it('counts nothing for an activity with only altitude notes', () => {
    expect(
      skippedReadings({
        'altitude-jump': 1,
        'implausible-climb': 1,
        'stream-disagreement': 1,
        'missing-altitude': 1,
      }),
    ).toBe(0)
  })
})

describe('skippedKinds', () => {
  it('lists only the kinds with a reading, never one with a zero count', () => {
    expect(skippedKinds({ 'hr-dropout': 0, 'speed-spike': 2 })).toEqual(['speed-spike'])
  })
})

describe('skippedReadingsText', () => {
  it('says the readings were skipped once for one, and the count otherwise', () => {
    expect(skippedReadingsText(1)).toBe('Readings skipped once')
    expect(skippedReadingsText(2)).toBe('Readings skipped 2 times')
  })

  it('groups the count from a thousand on', () => {
    expect(skippedReadingsText(1204)).toBe('Readings skipped 1,204 times')
  })
})
