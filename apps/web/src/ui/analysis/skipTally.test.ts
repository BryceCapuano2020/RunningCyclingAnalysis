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
    expect(tallyOf({ activities: 10, rejected: 3, duplicates: [] }, rejected)).toEqual({
      saved: 10,
      needLook: 1,
      otherSports: 2,
      alreadyAdded: 0,
      unlisted: 0,
    })
  })

  it('counts the files in a format the app does not read as needing a look, though they are not listed', () => {
    const tally = tallyOf({ activities: 0, rejected: 3, duplicates: [] }, [
      file('a.fit', 'unsupported-sport', 'hiking'),
    ])
    expect(tally.needLook).toBe(2)
    expect(tally.otherSports).toBe(1)
  })

  it('takes the copies left out of the saved activities, since they were read but not kept', () => {
    const copy = file('copy.gpx', 'duplicate', 'run.fit')
    const tally = tallyOf({ activities: 5, rejected: 0, duplicates: [copy, copy] }, [])
    expect(tally.saved).toBe(3)
    expect(tally.alreadyAdded).toBe(2)
  })

  it("counts the files an export's list does not name apart, and none when the outcome has no count", () => {
    expect(
      tallyOf({ activities: 1, rejected: 0, duplicates: [], notActivities: 320 }, []).unlisted,
    ).toBe(320)
    expect(tallyOf({ activities: 1, rejected: 0, duplicates: [] }, []).unlisted).toBe(0)
  })

  it('adds up to every file the import saw', () => {
    const tally = tallyOf(
      { activities: 12, rejected: 4, duplicates: [file('c.gpx', 'duplicate')], notActivities: 5 },
      otherSports(3),
    )
    const files = tally.saved + skippedTotal(tally)
    expect(files).toBe(12 + 4 + 5)
  })
})

describe('skippedTotal: the files an import did not save', () => {
  it('counts every part but the saved ones', () => {
    expect(
      skippedTotal({ saved: 9, needLook: 1, otherSports: 2, alreadyAdded: 3, unlisted: 4 }),
    ).toBe(10)
  })

  it('is nothing when every file was saved', () => {
    expect(
      skippedTotal({ saved: 9, needLook: 0, otherSports: 0, alreadyAdded: 0, unlisted: 0 }),
    ).toBe(0)
  })
})

describe('tallySentence: a headline that adds up to the files read', () => {
  it("adds up the owner's Strava export: 3,018 files, 320 of them not in its list", () => {
    // 1,769 runs and 146 rides saved; 748 other sports, 1 empty, 2 too short and 32 with no sport; 320 saved routes.
    const rejected = [
      ...otherSports(748),
      file('19682145057.gpx', 'empty'),
      file('486884001.gpx', 'too-short'),
      file('2187381745.tcx', 'too-short'),
      ...Array.from({ length: 32 }, (_, i) => file(`n${i}.gpx`, 'no-sport')),
    ]
    const outcome = {
      activities: 1915,
      rejected: rejected.length,
      duplicates: [],
      notActivities: 320,
    }
    expect(tallySentence(tallyOf(outcome, rejected))).toBe(
      'Read 3,018 files: 1,915 saved, 35 need a look, 748 other sports left out on purpose, 320 not listed as activities, so not read.',
    )
  })

  it("reads the same export's untyped files as runs and rides once the list types them", () => {
    // The list types the 32 files, and names the empty GPX a Weight Training session: 1,947 saved, 751 refused.
    const rejected = [
      ...otherSports(748),
      file('19682145057.gpx', 'unsupported-sport', 'Weight Training'),
      file('486884001.gpx', 'too-short'),
      file('2187381745.tcx', 'too-short'),
    ]
    const outcome = {
      activities: 1947,
      rejected: rejected.length,
      duplicates: [],
      notActivities: 320,
    }
    expect(tallySentence(tallyOf(outcome, rejected))).toBe(
      'Read 3,018 files: 1,947 saved, 2 need a look, 749 other sports left out on purpose, 320 not listed as activities, so not read.',
    )
  })

  it('leaves out a part with no files', () => {
    const outcome = { activities: 4, rejected: 1, duplicates: [] }
    expect(tallySentence(tallyOf(outcome, [file('a.gpx', 'empty')]))).toBe(
      'Read 5 files: 4 saved, 1 needs a look.',
    )
  })

  it('writes one file of each kind in the singular', () => {
    const outcome = {
      activities: 3,
      rejected: 2,
      duplicates: [file('c.gpx', 'duplicate')],
      notActivities: 1,
    }
    const rejected = [file('a.gpx', 'empty'), file('b.fit', 'unsupported-sport', 'hiking')]
    expect(tallySentence(tallyOf(outcome, rejected))).toBe(
      'Read 6 files: 2 saved, 1 needs a look, 1 other sport left out on purpose, 1 already added, 1 not listed as activities, so not read.',
    )
  })

  it('says nothing was saved by leaving the part out, not by writing 0', () => {
    const outcome = { activities: 0, rejected: 2, duplicates: [] }
    const sentence = tallySentence(tallyOf(outcome, [file('a', 'empty'), file('b', 'corrupt')]))
    expect(sentence).toBe('Read 2 files: 2 need a look.')
  })

  it('names the copies of workouts already held', () => {
    const outcome = { activities: 12, rejected: 0, duplicates: [file('c.gpx', 'duplicate')] }
    expect(tallySentence(tallyOf(outcome, []))).toBe('Read 12 files: 11 saved, 1 already added.')
  })
})
