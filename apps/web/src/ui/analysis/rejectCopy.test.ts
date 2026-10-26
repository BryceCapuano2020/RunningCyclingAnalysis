import { describe, expect, it } from 'vitest'
import type { RejectCode, RejectedFile } from '@rca/core/session'
import { groupRejected, lineNamesAction, rejectionCopy, SKIPPED_GROUP_COPY } from './rejectCopy'
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
    ['corrupt', 'Damaged, so it could not be read. Export it again.'],
    ['empty', 'It has no activity records in it.'],
    ['too-short', 'Too short: it records less than a minute.'],
    ['too-sparse', 'Recorded too sparsely: its points are more than 10 seconds apart.'],
    ['too-long', 'Longer than 48 hours, so it is left out.'],
    ['too-much-data', 'Too much data for one file. Export a shorter range.'],
    ['no-date', 'Its times are device time only, so it cannot be placed in your history.'],
    ['implausible-date', 'Its date is not plausible, so it is left out.'],
    ['no-sport', 'It does not say whether it is a run or a ride, so it is not guessed.'],
    ['e-bike', 'E-bike rides are left out, because motor help hides your own power.'],
    ['duplicate', 'Same workout as run.fit, so it was not counted twice.'],
    ['unreadable', 'This file could not be read.'],
  ] as const)('words the %s code', (code, copy) => {
    const detail = code === 'duplicate' ? 'run.fit' : undefined
    expect(rejectionCopy(file('a.fit', { code, detail }))).toBe(copy)
  })

  it('names a sport in words, not as the source labels it', () => {
    expect(rejectionCopy(file('walk.fit', { code: 'unsupported-sport', detail: 'walking' }))).toBe(
      'A walk is not a run or a ride, so it was left out on purpose.',
    )
    expect(
      rejectionCopy(file('gym.fit', { code: 'unsupported-sport', detail: 'fitnessEquipment' })),
    ).toBe('A gym or fitness session is not a run or a ride, so it was left out on purpose.')
  })

  it('falls back to one plain line for a sport it has no word for', () => {
    expect(rejectionCopy(file('x.fit', { code: 'unsupported-sport', detail: 'kitesurfing' }))).toBe(
      'Another sport is not a run or a ride, so it was left out on purpose.',
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

describe('rejectCopy: details the core gives', () => {
  it('matches a sport label whatever its case', () => {
    expect(rejectionCopy(file('w.fit', { code: 'unsupported-sport', detail: 'Walking' }))).toBe(
      'A walk is not a run or a ride, so it was left out on purpose.',
    )
    expect(
      rejectionCopy(file('g.fit', { code: 'unsupported-sport', detail: 'FITNESSEQUIPMENT' })),
    ).toBe('A gym or fitness session is not a run or a ride, so it was left out on purpose.')
  })

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

describe('rejectionCopy: the export advice is said once, by the line or by its group', () => {
  it('keeps the advice in a damaged file line when its group gives no action', () => {
    expect(rejectionCopy(file('bad.fit', { code: 'corrupt' }), false)).toBe(
      'Damaged, so it could not be read. Export it again.',
    )
  })

  it('leaves the advice out of a damaged file line when its group gives the action', () => {
    expect(rejectionCopy(file('bad.fit', { code: 'corrupt' }), true)).toBe(
      'Damaged, so it could not be read.',
    )
  })

  it('leaves the advice out of an archive line when its group gives the action', () => {
    expect(rejectionCopy(file('x.zip', { code: 'corrupt', detail: '2' }), true)).toBe(
      '2 entries could not be read because the archive is damaged.',
    )
  })

  it('leaves the advice out of a too-large line when its group gives the action', () => {
    expect(
      rejectionCopy(file('big.fit', { code: 'too-large', detail: String(64 * 1024 ** 2) }), true),
    ).toBe('Too large to read (over 64 MB).')
  })

  it('leaves the advice out of a too-much-data line when its group gives the action', () => {
    expect(rejectionCopy(file('big.fit', { code: 'too-much-data' }), true)).toBe(
      'Too much data for one file.',
    )
  })

  it('names the reasons whose lines carry the advice, and no others', () => {
    for (const code of ['corrupt', 'too-large', 'too-much-data'] as const) {
      expect(lineNamesAction(file('x', { code }))).toBe(true)
    }
    expect(lineNamesAction(file('empty.fit', { code: 'empty' }))).toBe(false)
    expect(lineNamesAction(file('long.fit', { code: 'too-long' }))).toBe(false)
  })
})

/** Every core code, with the group it belongs to. The type makes this list complete. */
const GROUP_OF_CODE: Record<RejectCode, SkippedGroup> = {
  'not-activity': 'not-activity',
  corrupt: 'damaged',
  empty: 'damaged',
  unreadable: 'damaged',
  'unsupported-sport': 'not-run-or-ride',
  'no-sport': 'not-run-or-ride',
  'e-bike': 'not-run-or-ride',
  'too-short': 'not-usable',
  'too-sparse': 'not-usable',
  'too-long': 'not-usable',
  'too-much-data': 'not-usable',
  'too-large': 'not-usable',
  'no-date': 'not-usable',
  'implausible-date': 'not-usable',
  duplicate: 'duplicate',
}

describe('groupRejected: every core code has a group and a sentence', () => {
  it.each(Object.entries(GROUP_OF_CODE))('puts %s in the %s group', (code, group) => {
    const groups = groupRejected([file('x', { code: code as RejectCode, detail: 'd' })])
    expect(groups.map((g) => g.group)).toEqual([group])
  })

  it.each(Object.keys(GROUP_OF_CODE))('words %s in a sentence of its own', (code) => {
    const copy = rejectionCopy(file('x', { code: code as RejectCode, detail: '1' }))
    expect(copy.length).toBeGreaterThan(10)
    expect(copy).not.toContain('core reason')
  })
})

describe('groupRejected: plain groups, each with one suggested action', () => {
  it('puts each file under the group its reason belongs to, in a fixed order', () => {
    const groups = groupRejected([
      file('dup.fit', { code: 'duplicate', detail: 'a.fit' }),
      file('notes.txt', { code: 'not-activity' }),
      file('walk.fit', { code: 'unsupported-sport', detail: 'walking' }),
      file('bad.fit', { code: 'corrupt' }),
      file('short.fit', { code: 'too-short' }),
    ])

    expect(groups.map((group) => group.group)).toEqual([
      'not-activity',
      'damaged',
      'not-run-or-ride',
      'not-usable',
      'duplicate',
    ])
    expect(groups.find((group) => group.group === 'duplicate')?.files).toHaveLength(1)
  })

  it('leaves out a group that has no files', () => {
    expect(groupRejected([file('bad.fit', { code: 'corrupt' })])).toHaveLength(1)
  })

  it('gives every group a title and a suggested action', () => {
    for (const group of Object.values(SKIPPED_GROUP_COPY)) {
      expect(group.title(2)).toMatch(/2/)
      expect(group.action.length).toBeGreaterThan(20)
    }
  })

  it('keeps every group copy free of the words the app avoids', () => {
    const copy = JSON.stringify(SKIPPED_GROUP_COPY) + rejectionCopy(file('a', { code: 'corrupt' }))
    for (const word of ['limiter', 'weak', 'strength', 'holding you back', 'ahead of', 'worker']) {
      expect(copy).not.toContain(word)
    }
  })
})
