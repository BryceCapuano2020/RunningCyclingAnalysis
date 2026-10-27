import { describe, expect, it } from 'vitest'
import type { RejectCode, RejectedFile } from '@rca/core/session'
import { skippedTotal, tallyOf, tallySentence } from './skipTally'

function file(fileName: string, code: RejectCode, detail?: string): RejectedFile {
  return { fileName, reason: 'core reason', code, detail }
}

/** `count` files of one other sport, as a Strava export names it. */
function otherSports(count: number): RejectedFile[] {
  return Array.from({ length: count }, (_, i) =>
    file(`a/${i}.fit`, 'unsupported-sport', 'training'),
  )
}

describe('tallyOf: where each file of an import went', () => {
  it('splits the refused files into those that need a look and those left out on purpose', () => {
    const rejected = [
      file('a.gpx', 'empty'),
      file('b.fit', 'unsupported-sport', 'hiking'),
      file('c.fit', 'e-bike'),
    ]
    expect(tallyOf({ filesAdded: 10, rejected: 3, duplicates: [] }, rejected)).toEqual({
      added: 10,
      needLook: 1,
      otherSports: 2,
      alreadyAdded: 0,
      unlisted: 0,
    })
  })

  it('counts the files in a format the app does not read as needing a look, though they are not listed', () => {
    const tally = tallyOf({ filesAdded: 0, rejected: 3, duplicates: [] }, [
      file('a.fit', 'unsupported-sport', 'hiking'),
    ])
    expect(tally.needLook).toBe(2)
    expect(tally.otherSports).toBe(1)
  })

  it('counts the files added and the files already added, each once, whatever they hold', () => {
    // A file of several sessions is one file: its sessions are counted by the outcome's activities.
    const copy = file('copy.gpx', 'duplicate', 'run.fit')
    const outcome = { activities: 9, filesAdded: 3, rejected: 0, duplicates: [copy, copy] }
    const tally = tallyOf(outcome, [])
    expect(tally.added).toBe(3)
    expect(tally.alreadyAdded).toBe(2)
  })

  it("counts the files an export's list does not name apart, and none when the outcome has no count", () => {
    expect(
      tallyOf({ filesAdded: 1, rejected: 0, duplicates: [], notActivities: 320 }, []).unlisted,
    ).toBe(320)
    expect(tallyOf({ filesAdded: 1, rejected: 0, duplicates: [] }, []).unlisted).toBe(0)
  })

  it('adds up to every file the import saw', () => {
    const tally = tallyOf(
      { filesAdded: 11, rejected: 4, duplicates: [file('c.gpx', 'duplicate')], notActivities: 5 },
      otherSports(3),
    )
    const files = tally.added + skippedTotal(tally)
    expect(files).toBe(11 + 1 + 4 + 5)
  })
})

describe('skippedTotal: the files an import did not add', () => {
  it('counts every part but the added ones', () => {
    expect(
      skippedTotal({ added: 9, needLook: 1, otherSports: 2, alreadyAdded: 3, unlisted: 4 }),
    ).toBe(10)
  })

  it('is nothing when every file was added', () => {
    expect(
      skippedTotal({ added: 9, needLook: 0, otherSports: 0, alreadyAdded: 0, unlisted: 0 }),
    ).toBe(0)
  })
})

describe('tallySentence: a headline that adds up to the files read', () => {
  it("adds up the owner's Strava export: 3,018 files, 320 of them not in its list", () => {
    // 1,769 runs and 146 rides added; 748 other sports, 1 empty, 2 too short and 32 with no sport; 320 saved routes.
    const rejected = [
      ...otherSports(748),
      file('19682145057.gpx', 'empty'),
      file('486884001.gpx', 'too-short'),
      file('2187381745.tcx', 'too-short'),
      ...Array.from({ length: 32 }, (_, i) => file(`n${i}.gpx`, 'no-sport')),
    ]
    const outcome = {
      filesAdded: 1915,
      rejected: rejected.length,
      duplicates: [],
      notActivities: 320,
    }
    expect(tallySentence(tallyOf(outcome, rejected))).toBe(
      '3,018 files: 1,915 added, 35 need a look, 748 other sports left out on purpose, 320 not listed as activities.',
    )
  })

  it("reads the same export's untyped files as runs and rides once the list types them", () => {
    // The list types the 32 files, and names the empty GPX a Weight Training session: 1,947 added, 751 refused.
    const rejected = [
      ...otherSports(748),
      file('19682145057.gpx', 'unsupported-sport', 'Weight Training'),
      file('486884001.gpx', 'too-short'),
      file('2187381745.tcx', 'too-short'),
    ]
    const outcome = {
      filesAdded: 1947,
      rejected: rejected.length,
      duplicates: [],
      notActivities: 320,
    }
    expect(tallySentence(tallyOf(outcome, rejected))).toBe(
      '3,018 files: 1,947 added, 2 need a look, 749 other sports left out on purpose, 320 not listed as activities.',
    )
  })

  it('leaves out a part with no files', () => {
    const outcome = { filesAdded: 4, rejected: 1, duplicates: [] }
    expect(tallySentence(tallyOf(outcome, [file('a.gpx', 'empty')]))).toBe(
      '5 files: 4 added, 1 needs a look.',
    )
  })

  it('writes one file of each kind in the singular', () => {
    const outcome = {
      filesAdded: 2,
      rejected: 2,
      duplicates: [file('c.gpx', 'duplicate')],
      notActivities: 1,
    }
    const rejected = [file('a.gpx', 'empty'), file('b.fit', 'unsupported-sport', 'hiking')]
    expect(tallySentence(tallyOf(outcome, rejected))).toBe(
      '6 files: 2 added, 1 needs a look, 1 other sport left out on purpose, 1 already added, 1 not listed as activities.',
    )
  })

  it('says nothing was added by leaving the part out, not by writing 0', () => {
    const outcome = { filesAdded: 0, rejected: 2, duplicates: [] }
    const sentence = tallySentence(tallyOf(outcome, [file('a', 'empty'), file('b', 'corrupt')]))
    expect(sentence).toBe('2 files: 2 need a look.')
  })

  it('names the copies of workouts already held', () => {
    const outcome = { filesAdded: 11, rejected: 0, duplicates: [file('c.gpx', 'duplicate')] }
    expect(tallySentence(tallyOf(outcome, []))).toBe('12 files: 11 added, 1 already added.')
  })
})
