import { describe, expect, it } from 'vitest'
import type { RejectCode, RejectedFile } from '@rca/core/session'
import {
  ADVICE,
  adviceCarriers,
  bySport,
  groupRejected,
  rejectionCopy,
  sportLabel,
} from './rejectCopy'
import type { SkippedGroup } from './rejectCopy'

function file(
  fileName: string,
  overrides: Partial<RejectedFile> & { code: RejectCode },
): RejectedFile {
  return { fileName, reason: 'core reason, not for users', ...overrides }
}

describe('rejectionCopy: one plain sentence per reason code', () => {
  it.each([
    ['not-activity', 'Not a FIT, GPX or TCX file, so it cannot be read.'],
    ['corrupt', 'Damaged, so it could not be read.'],
    ['empty', 'It holds no recorded points, so there is nothing to read.'],
    ['too-short', 'Too short: it records less than a minute.'],
    ['too-sparse', 'Recorded too sparsely: its points are more than 10 seconds apart.'],
    ['too-long', 'Longer than 48 hours, so it is left out.'],
    ['too-much-data', 'Too much data for one file.'],
    ['no-date', 'Its times are device time only, so it cannot be placed in your history.'],
    ['implausible-date', 'Its date is not plausible, so it is left out.'],
    ['no-sport', 'It does not say whether it is a run or a ride, so it is not guessed.'],
    ['e-bike', 'E-bike rides are left out, because motor help hides your own power.'],
    ['duplicate', 'Same workout as run.fit, so it was not counted twice.'],
    ['unreadable', 'This file could not be read.'],
  ] as const)('words the %s code', (code, copy) => {
    const detail = code === 'duplicate' ? 'run.fit' : undefined
    expect(rejectionCopy(file('a.fit', { code, detail }), false)).toBe(copy)
  })

  it('never calls an empty file damaged, or tells its owner to export it again', () => {
    const copy = rejectionCopy(file('empty.gpx', { code: 'empty' }))
    expect(copy).toBe('It holds no recorded points, so there is nothing to read.')
    expect(copy).not.toMatch(/records|export/i)
  })

  it('names a sport in words, not as the source labels it', () => {
    expect(rejectionCopy(file('walk.fit', { code: 'unsupported-sport', detail: 'walking' }))).toBe(
      'A walk is not a run or a ride.',
    )
    expect(
      rejectionCopy(file('gym.fit', { code: 'unsupported-sport', detail: 'fitnessEquipment' })),
    ).toBe('A gym or fitness session is not a run or a ride.')
  })

  it('falls back to one plain line for a sport it has no word for', () => {
    expect(rejectionCopy(file('x.fit', { code: 'unsupported-sport', detail: 'kitesurfing' }))).toBe(
      'Another sport is not a run or a ride.',
    )
  })

  it('says how large a file may be, in megabytes, when the limit is known', () => {
    expect(
      rejectionCopy(file('big.fit', { code: 'too-large', detail: String(64 * 1024 ** 2) })),
    ).toBe('Too large to read (over 64 MB). Export a shorter range.')
  })

  it('says a file is too large without a number when the limit is not given', () => {
    expect(rejectionCopy(file('big.zip', { code: 'too-large' }))).toBe(
      'Too large to read. Export a shorter range.',
    )
  })

  it('never shows the core reason, whatever the code', () => {
    for (const code of ['corrupt', 'duplicate'] as const) {
      expect(rejectionCopy(file('a.fit', { code }))).not.toContain('core reason')
    }
  })
})

describe('rejectCopy: the sports of both sources', () => {
  it.each([
    ['walking', 'A walk'],
    ['Walk', 'A walk'],
    ['hiking', 'A hike'],
    ['Hike', 'A hike'],
    ['swimming', 'A swim'],
    ['Swim', 'A swim'],
    ['fitnessEquipment', 'A gym or fitness session'],
    ['Weight Training', 'A gym or fitness session'],
    ['training', 'A training session'],
    ['Workout', 'A training session'],
    ['rowing', 'A row'],
    ['Row', 'A row'],
    ['alpineSkiing', 'A ski session'],
    ['crossCountrySkiing', 'A ski session'],
    ['Alpine Ski', 'A ski session'],
    ['Nordic Ski', 'A ski session'],
    ['tennis', 'A tennis session'],
    ['Tennis', 'A tennis session'],
  ])('names %s as %s, whether FIT or Strava gives it', (detail, subject) => {
    expect(rejectionCopy(file('x', { code: 'unsupported-sport', detail }))).toBe(
      `${subject} is not a run or a ride.`,
    )
  })

  it('matches a sport label whatever its case, spacing or underscores', () => {
    for (const detail of [
      'Walking',
      'WALKING',
      'weight_training',
      'WEIGHT-TRAINING',
      'alpine ski',
    ]) {
      expect(rejectionCopy(file('x', { code: 'unsupported-sport', detail }))).not.toMatch(
        /^Another/,
      )
    }
  })

  it('falls back to one plain line for a sport it has no word for, or for a code with no name', () => {
    for (const detail of ['kitesurfing', '9', 'unknown', undefined]) {
      expect(rejectionCopy(file('x', { code: 'unsupported-sport', detail }))).toBe(
        'Another sport is not a run or a ride.',
      )
    }
  })

  it('shows a type the export list gives as it is, when the table has no word for it', () => {
    for (const detail of ['Kayaking', 'Rock Climbing', 'Yoga']) {
      const refused = file('x.gpx', { code: 'unsupported-sport', detail, listed: true })
      expect(rejectionCopy(refused)).toBe(`${detail} is not a run or a ride.`)
      expect(sportLabel(refused)).toBe(detail)
    }
  })

  it('prefers the table to a list type, so one sport is one line whichever source names it', () => {
    const listed = file('x.gpx', { code: 'unsupported-sport', detail: 'Workout', listed: true })
    expect(rejectionCopy(listed)).toBe('A training session is not a run or a ride.')
    expect(sportLabel(listed)).toBe('Training session')
  })

  it('keeps Another sport for a name the file gives, listed or not', () => {
    const named = [
      file('a.fit', { code: 'unsupported-sport', detail: 'kayaking' }),
      file('b.gpx', { code: 'unsupported-sport', detail: '4' }),
      file('c.tcx', { code: 'unsupported-sport', detail: 'Other' }),
      file('d.gpx', { code: 'unsupported-sport', detail: '', listed: true }),
    ]
    for (const refused of named) expect(sportLabel(refused)).toBe('Another sport')
  })

  it('counts a list type as a line of its own, apart from the same word a FIT file gives', () => {
    const files = [
      file('a.gpx', { code: 'unsupported-sport', detail: 'Kayaking', listed: true }),
      file('b.gpx', { code: 'unsupported-sport', detail: 'Kayaking', listed: true }),
      file('c.fit', { code: 'unsupported-sport', detail: 'kayaking' }),
      file('d.gpx', { code: 'unsupported-sport', detail: 'Hike', listed: true }),
    ]
    expect(bySport(files).map(({ label, files: members }) => [label, members.length])).toEqual([
      ['Kayaking', 2],
      ['Another sport', 1],
      ['Hike', 1],
    ])
  })

  it('labels a sport for a line of its own, without the article', () => {
    expect(sportLabel(file('x', { code: 'unsupported-sport', detail: 'Workout' }))).toBe(
      'Training session',
    )
    expect(sportLabel(file('x', { code: 'unsupported-sport', detail: 'hiking' }))).toBe('Hike')
    expect(sportLabel(file('x', { code: 'unsupported-sport', detail: 'kitesurfing' }))).toBe(
      'Another sport',
    )
    expect(sportLabel(file('x', { code: 'e-bike' }))).toBe('E-bike ride')
  })

  it('counts the files of each sport once, whichever source named it, the most files first', () => {
    const files = [
      file('a.fit', { code: 'unsupported-sport', detail: 'hiking' }),
      file('b.gpx', { code: 'unsupported-sport', detail: 'Workout' }),
      file('c.fit', { code: 'unsupported-sport', detail: 'training' }),
      file('d.gpx', { code: 'unsupported-sport', detail: 'Hike' }),
      file('e.fit', { code: 'unsupported-sport', detail: 'training' }),
      file('f.fit', { code: 'e-bike' }),
    ]
    expect(bySport(files).map(({ label, files: members }) => [label, members.length])).toEqual([
      ['Training session', 3],
      ['Hike', 2],
      ['E-bike ride', 1],
    ])
  })

  it('keeps the files of a sport in the order they came', () => {
    const files = [
      file('a.fit', { code: 'unsupported-sport', detail: 'walking' }),
      file('b.gpx', { code: 'unsupported-sport', detail: 'Walk' }),
    ]
    expect(bySport(files)[0]!.files).toEqual(files)
  })
})

describe('rejectCopy: details the core gives', () => {
  it('says how many entries a damaged archive lost, from the count the core gives', () => {
    expect(rejectionCopy(file('x.zip', { code: 'corrupt', detail: '2' }))).toBe(
      '2 entries could not be read because the archive is damaged. Export it again.',
    )
    expect(rejectionCopy(file('x.zip', { code: 'corrupt', detail: '1' }))).toBe(
      '1 entry could not be read because the archive is damaged. Export it again.',
    )
  })

  it('gives an archive limit in megabytes, from the byte limit the core gives', () => {
    expect(
      rejectionCopy(file('big.zip', { code: 'too-large', detail: String(2 * 1024 ** 3) })),
    ).toBe('Too large to read (over 2 GB). Export a shorter range.')
  })
})

describe('rejectionCopy: a line keeps its advice unless it is told not to', () => {
  it('keeps the advice in a damaged file line by default', () => {
    expect(rejectionCopy(file('bad.fit', { code: 'corrupt' }))).toBe(
      'Damaged, so it could not be read. Export it again.',
    )
  })

  it('leaves the advice out of a line that does not carry it', () => {
    expect(rejectionCopy(file('bad.fit', { code: 'corrupt' }), false)).toBe(
      'Damaged, so it could not be read.',
    )
    expect(rejectionCopy(file('x.zip', { code: 'corrupt', detail: '2' }), false)).toBe(
      '2 entries could not be read because the archive is damaged.',
    )
    expect(
      rejectionCopy(file('big.fit', { code: 'too-large', detail: String(64 * 1024 ** 2) }), false),
    ).toBe('Too large to read (over 64 MB).')
  })

  it('gives advice only to the reasons the athlete can act on, and never to an empty file', () => {
    expect(Object.keys(ADVICE).sort()).toEqual(
      [
        'corrupt',
        'implausible-date',
        'no-date',
        'not-activity',
        'too-large',
        'too-long',
        'too-much-data',
        'too-short',
        'too-sparse',
      ].sort(),
    )
    expect(ADVICE.empty).toBeUndefined()
    expect(ADVICE['no-sport']).toBeUndefined()
  })

  it.each([
    ['too-short', 'Too short: it records less than a minute.'],
    ['too-sparse', 'Recorded too sparsely: its points are more than 10 seconds apart.'],
    ['no-date', 'Its times are device time only, so it cannot be placed in your history.'],
    ['implausible-date', 'Its date is not plausible, so it is left out.'],
  ] as const)(
    'tells a %s file to check the recording, and not to export a shorter range',
    (code, sentence) => {
      expect(rejectionCopy(file('s.gpx', { code }))).toBe(
        `${sentence} Check the recording on your device.`,
      )
    },
  )

  it.each([
    ['too-long', 'Longer than 48 hours, so it is left out.'],
    ['too-much-data', 'Too much data for one file.'],
  ] as const)(
    'tells a %s file to check the recording or export a shorter range',
    (code, sentence) => {
      expect(rejectionCopy(file('l.gpx', { code }))).toBe(
        `${sentence} Check the recording on your device, or export a shorter range.`,
      )
    },
  )

  it('tells a too-large file to export a shorter range, and nothing about the recording', () => {
    expect(rejectionCopy(file('big.fit', { code: 'too-large' }))).toBe(
      'Too large to read. Export a shorter range.',
    )
  })
})

describe('adviceCarriers: each piece of advice is said once, in the first line that gives it', () => {
  it('lets the first of two damaged files carry the advice', () => {
    const bad = file('bad.fit', { code: 'corrupt' })
    expect([...adviceCarriers([bad, file('bad2.fit', { code: 'corrupt' })])]).toEqual([bad])
  })

  it('lets one line carry each different piece of advice', () => {
    const bad = file('bad.fit', { code: 'corrupt' })
    const big = file('big.fit', { code: 'too-large' })
    const bigAgain = file('big2.fit', { code: 'too-large' })
    const heavy = file('heavy.fit', { code: 'too-much-data' })
    const long = file('long.fit', { code: 'too-long' })
    const short = file('short.fit', { code: 'too-short' })
    const sparse = file('sparse.fit', { code: 'too-sparse' })
    expect([...adviceCarriers([bad, big, bigAgain, heavy, long, short, sparse])]).toEqual([
      bad,
      big,
      heavy,
      short,
    ])
  })

  it('gives no carrier to a reason without advice', () => {
    const empty = file('empty.gpx', { code: 'empty' })
    const noSport = file('x.gpx', { code: 'no-sport' })
    expect(adviceCarriers([empty, noSport]).size).toBe(0)
  })
})

/** Every core code, with the group it belongs to. The type makes this list complete. */
const GROUP_OF_CODE: Record<RejectCode, SkippedGroup> = {
  'not-activity': 'need-a-look',
  corrupt: 'need-a-look',
  empty: 'need-a-look',
  unreadable: 'need-a-look',
  'no-sport': 'need-a-look',
  'too-short': 'need-a-look',
  'too-sparse': 'need-a-look',
  'too-long': 'need-a-look',
  'too-much-data': 'need-a-look',
  'too-large': 'need-a-look',
  'no-date': 'need-a-look',
  'implausible-date': 'need-a-look',
  'unsupported-sport': 'other-sports',
  'e-bike': 'other-sports',
  duplicate: 'already-added',
}

describe('groupRejected: every core code has a group and a sentence', () => {
  it.each(Object.entries(GROUP_OF_CODE))('puts %s in the %s group', (code, group) => {
    const groups = groupRejected([file('x', { code: code as RejectCode, detail: 'd' })])
    expect(groups[group as SkippedGroup]).toHaveLength(1)
    const others = Object.values(groups).reduce((sum, files) => sum + files.length, 0)
    expect(others).toBe(1)
  })

  it.each(Object.keys(GROUP_OF_CODE))('words %s in a sentence of its own', (code) => {
    const copy = rejectionCopy(file('x', { code: code as RejectCode, detail: '1' }))
    expect(copy.length).toBeGreaterThan(10)
    expect(copy).not.toContain('core reason')
  })

  it('keeps a file that does not say its sport with the files that need a look, not with the sports left out on purpose', () => {
    const groups = groupRejected([file('x.gpx', { code: 'no-sport' })])
    expect(groups['need-a-look']).toHaveLength(1)
    expect(groups['other-sports']).toHaveLength(0)
  })

  it('keeps the files of a group in the order they came', () => {
    const [first, second] = [file('a.fit', { code: 'empty' }), file('b.fit', { code: 'corrupt' })]
    expect(groupRejected([first, second])['need-a-look']).toEqual([first, second])
  })

  it('keeps every reason free of the words the app avoids', () => {
    const copy = Object.keys(GROUP_OF_CODE)
      .map((code) => rejectionCopy(file('a', { code: code as RejectCode, detail: '1' })))
      .join(' ')
    for (const word of ['limiter', 'weak', 'strength', 'holding you back', 'ahead of', 'worker']) {
      expect(copy).not.toContain(word)
    }
  })
})
