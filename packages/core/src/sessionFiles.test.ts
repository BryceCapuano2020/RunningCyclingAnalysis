import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildFit, secondly } from './fit/fitTestFiles'
import { AnalysisSession } from './session'
import type { RejectedFile } from './session'
import type { AthleteSettings } from './types'

/** What an import counts: files, not the activities they hold, with the lists the counts come from. */

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const MORNING_MS = Date.UTC(2024, 4, 1, 7, 30)
const EVENING_MS = Date.UTC(2024, 4, 1, 18, 30)

/** A two-minute run, with a heart rate when asked, so that a file with one is the richer copy. */
function run(startMs: number, heartRate?: number) {
  const fields = { speed: 3, altitude: 50, ...(heartRate === undefined ? {} : { heartRate }) }
  return {
    sport: 'running' as const,
    startMs,
    durationS: 120,
    records: secondly(startMs, 120, fields),
  }
}

function fit(name: string, ...sessions: ReturnType<typeof run>[]): File {
  return new File([new Uint8Array(buildFit({ sessions }))], name)
}

function fitBytes(): Uint8Array {
  return new Uint8Array(buildFit({ sessions: [run(MORNING_MS)] }))
}

function zip(entries: Record<string, Uint8Array>): File {
  return new File([new Uint8Array(zipSync(entries))], 'export.zip')
}

/** Adds the files, and returns the state with the counts and the copies the import ended on. */
async function importFiles(session: AnalysisSession, files: File[]) {
  let outcome = { activities: -1, filesAdded: -1, rejected: -1, notActivities: -1 }
  let duplicates: RejectedFile[] = []
  let added: unknown[] = []
  const state = await session.addFiles(files, SETTINGS, undefined, undefined, false, (done) => {
    outcome = {
      activities: done.activities,
      filesAdded: done.filesAdded,
      rejected: done.rejected,
      notActivities: done.notActivities,
    }
    duplicates = done.duplicates
    added = done.added
  })
  return { state, outcome, duplicates, added }
}

/** Two single-session files that hold the richer copies of the morning and evening runs. */
async function sessionHolding(...runs: number[]): Promise<AnalysisSession> {
  const session = new AnalysisSession()
  await importFiles(
    session,
    runs.map((startMs, i) => fit(`held-${i}.fit`, run(startMs, 150))),
  )
  return session
}

describe('an import counts files, not the activities they hold', () => {
  it('counts a file with two sessions once, as added, while its activities count twice', async () => {
    const session = new AnalysisSession()
    const { outcome, duplicates } = await importFiles(session, [
      fit('two.fit', run(MORNING_MS), run(EVENING_MS)),
    ])
    expect(outcome).toEqual({ activities: 2, filesAdded: 1, rejected: 0, notActivities: 0 })
    expect(duplicates).toEqual([])
  })

  it('counts a file whose sessions are all copies once, as already added', async () => {
    const session = await sessionHolding(MORNING_MS, EVENING_MS)
    const { outcome, duplicates } = await importFiles(session, [
      fit('two.fit', run(MORNING_MS), run(EVENING_MS)),
    ])
    expect(outcome).toEqual({ activities: 2, filesAdded: 0, rejected: 0, notActivities: 0 })
    expect(duplicates).toEqual([
      expect.objectContaining({ fileName: 'two.fit', code: 'duplicate', detail: 'held-0.fit' }),
    ])
  })

  it('counts a file with one copy and one new session as added, and leaves the copy out of the groups', async () => {
    const session = await sessionHolding(MORNING_MS)
    const { outcome, duplicates } = await importFiles(session, [
      fit('two.fit', run(MORNING_MS), run(EVENING_MS)),
    ])
    expect(outcome).toEqual({ activities: 2, filesAdded: 1, rejected: 0, notActivities: 0 })
    expect(duplicates).toEqual([])
  })

  it('counts every file once: added, already added or refused, with nothing counted twice', async () => {
    const session = await sessionHolding(MORNING_MS)
    const { outcome, duplicates, state } = await importFiles(session, [
      fit('copy.fit', run(MORNING_MS)),
      fit('new.fit', run(EVENING_MS)),
      new File([new Uint8Array(40)], 'broken.fit'),
    ])
    expect(outcome.filesAdded + duplicates.length + outcome.rejected).toBe(3)
    expect([outcome.filesAdded, duplicates.length, state.rejected.length]).toEqual([1, 1, 1])
  })
})

describe('an import adds only files that hold a workout the library did not', () => {
  it('counts the same files added again as already added, not as added', async () => {
    const session = await sessionHolding(MORNING_MS, EVENING_MS)
    const { outcome, duplicates } = await importFiles(session, [
      fit('held-0.fit', run(MORNING_MS, 150)),
      fit('held-1.fit', run(EVENING_MS, 150)),
    ])
    expect(outcome).toEqual({ activities: 2, filesAdded: 0, rejected: 0, notActivities: 0 })
    expect(duplicates.map(({ fileName, detail }) => ({ fileName, detail }))).toEqual([
      { fileName: 'held-0.fit', detail: 'held-0.fit' },
      { fileName: 'held-1.fit', detail: 'held-1.fit' },
    ])
  })

  it('counts a different file that holds the same activity as already added', async () => {
    const session = await sessionHolding(MORNING_MS)
    const { outcome, duplicates } = await importFiles(session, [
      fit('same-run.fit', run(MORNING_MS, 150)),
    ])
    expect(outcome.filesAdded).toBe(0)
    expect(duplicates).toEqual([
      expect.objectContaining({ fileName: 'same-run.fit', detail: 'held-0.fit' }),
    ])
  })

  it('counts a richer copy of a held workout as already added: the workout was in the library', async () => {
    const session = new AnalysisSession()
    await importFiles(session, [fit('poor.fit', run(MORNING_MS))])
    const { outcome, duplicates } = await importFiles(session, [
      fit('rich.fit', run(MORNING_MS, 150)),
    ])
    expect(outcome.filesAdded).toBe(0)
    expect(duplicates).toEqual([
      expect.objectContaining({ fileName: 'rich.fit', detail: 'poor.fit' }),
    ])
  })

  it('counts a file added twice in one import once, as added, and the second time as already added', async () => {
    const { outcome, duplicates } = await importFiles(new AnalysisSession(), [
      fit('first.fit', run(MORNING_MS)),
      fit('second.fit', run(MORNING_MS)),
    ])
    expect(outcome.filesAdded).toBe(1)
    expect(duplicates).toEqual([expect.objectContaining({ fileName: 'second.fit' })])
  })

  it('counts a new file whose workout is hidden as a copy of a held one as already added, so it agrees with "Nothing new"', async () => {
    const session = await sessionHolding(MORNING_MS)
    // The same run one second later at the same richness: a new workout key, hidden as a copy.
    const { outcome, duplicates, added } = await importFiles(session, [
      fit('a-second-later.fit', run(MORNING_MS + 1000, 150)),
    ])
    expect(added).toEqual([])
    expect(outcome.filesAdded).toBe(0)
    expect(duplicates).toEqual([
      expect.objectContaining({ fileName: 'a-second-later.fit', detail: 'held-0.fit' }),
    ])
  })

  it('counts a new file that hides the held copy of its workout as added, since it is the visible one', async () => {
    const session = await sessionHolding(MORNING_MS)
    const { outcome, duplicates, added } = await importFiles(session, [
      fit('a-second-earlier.fit', run(MORNING_MS - 1000, 150)),
    ])
    expect(added).toHaveLength(1)
    expect(outcome.filesAdded).toBe(1)
    expect(duplicates).toEqual([])
  })

  it('reports no file as added exactly when the import added no workout', async () => {
    const session = await sessionHolding(MORNING_MS)
    const files = [
      fit('held-0.fit', run(MORNING_MS, 150)),
      fit('a-second-later.fit', run(MORNING_MS + 1000, 150)),
    ]
    const { outcome, added } = await importFiles(session, files)
    expect([outcome.filesAdded, added.length]).toEqual([0, 0])
  })

  it('adds up a mixed import: new files, files added again, a copy and a refused file', async () => {
    const session = await sessionHolding(MORNING_MS, EVENING_MS)
    const NEXT_DAY_MS = Date.UTC(2024, 4, 2, 7, 30)
    const { outcome, duplicates, state } = await importFiles(session, [
      fit('new-a.fit', run(NEXT_DAY_MS, 150)),
      fit('new-b.fit', run(NEXT_DAY_MS + 4 * 3600_000, 150)),
      fit('held-0.fit', run(MORNING_MS, 150)),
      fit('poorer-copy.fit', run(EVENING_MS)),
      new File([new Uint8Array(40)], 'broken.fit'),
    ])
    expect(outcome.filesAdded).toBe(2)
    expect(duplicates.map((copy) => copy.fileName)).toEqual(['held-0.fit', 'poorer-copy.fit'])
    expect(state.rejected.map((file) => file.fileName)).toEqual(['broken.fit'])
    expect(outcome.filesAdded + duplicates.length + outcome.rejected).toBe(5)
  })
})

/** The refused files are counted and listed from one source: the count is the list and the unnamed files. */
function agree(
  outcome: { rejected: number },
  state: { rejected: unknown[]; unsupportedFiles: number },
) {
  expect(outcome.rejected).toBe(state.rejected.length + state.unsupportedFiles)
}

describe('an import lists every file it refuses, and counts what it lists', () => {
  const broken = (name: string) => new File([new Uint8Array(40)], name)

  it('lists two different files that share a name, which a list keyed by name merged into one', async () => {
    const { outcome, state } = await importFiles(new AnalysisSession(), [
      broken('2024-05-01.fit'),
      broken('2024-05-01.fit'),
    ])
    expect(state.rejected.map((file) => file.fileName)).toEqual([
      '2024-05-01.fit',
      '2024-05-01.fit',
    ])
    expect(outcome.rejected).toBe(2)
    agree(outcome, state)
  })

  it('counts the unreadable formats of two sources that share a name', async () => {
    const kml = () =>
      new File([new Uint8Array(zipSync({ 'a.kml': strToU8('<kml/>') }))], 'export.zip')
    const { outcome, state } = await importFiles(new AnalysisSession(), [kml(), kml()])
    expect(state.unsupportedFiles).toBe(2)
    agree(outcome, state)
  })

  it('takes back a refusal when a member of the same zip of that name is then read cleanly, and the count with it', async () => {
    // The damaged `.gz` member is refused under its own name, and the clean member of the name is read after it.
    const entries = { '2024-05-01.fit.gz': strToU8('not gzip'), '2024-05-01.fit': fitBytes() }
    const { outcome, state } = await importFiles(new AnalysisSession(), [zip(entries)])
    expect(state.rejected).toEqual([])
    expect(outcome.rejected).toBe(0)
    expect(outcome.filesAdded).toBe(1)
    agree(outcome, state)
  })

  it.each([
    ['damaged first', ['broken', 'clean']],
    ['clean first', ['clean', 'broken']],
  ] as const)(
    'gives the same counts for a damaged and a clean file of one name, %s',
    async (_order, order) => {
      const files = order.map((kind) =>
        kind === 'broken' ? broken('2024-05-01.fit') : fit('2024-05-01.fit', run(MORNING_MS)),
      )
      const { outcome, state, duplicates } = await importFiles(new AnalysisSession(), files)
      // Two files were dropped: one was added and one needs a look, whichever came first.
      expect([outcome.filesAdded, outcome.rejected, duplicates.length]).toEqual([1, 1, 0])
      expect(state.rejected.map((file) => file.fileName)).toEqual(['2024-05-01.fit'])
      agree(outcome, state)
    },
  )

  it('does not let a clean file take back the refusal of a different loose file of its name', async () => {
    const { outcome, state } = await importFiles(new AnalysisSession(), [
      broken('2024-05-01.fit'),
      broken('other.fit'),
      fit('2024-05-01.fit', run(MORNING_MS)),
    ])
    expect(state.rejected.map((file) => file.fileName)).toEqual(['2024-05-01.fit', 'other.fit'])
    expect(outcome.rejected).toBe(2)
    agree(outcome, state)
  })

  it('keeps a refusal under another name when a file is read cleanly', async () => {
    const { outcome, state } = await importFiles(new AnalysisSession(), [
      broken('a.fit'),
      fit('b.fit', run(MORNING_MS)),
    ])
    expect(state.rejected.map((file) => file.fileName)).toEqual(['a.fit'])
    agree(outcome, state)
  })
})
