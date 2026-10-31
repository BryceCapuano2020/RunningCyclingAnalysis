import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildFit, secondly } from './fit/fitTestFiles'
import type { FileId, HeldEntry, HeldFiles } from './importHeld'
import { AnalysisSession } from './session'
import type { SyncSink } from './session'
import { MODEL_REVISION } from './digest/modelRevision'
import type { ActivityDigest, AthleteSettings } from './types'

/** Skipping a file the index knows: nothing is parsed, the library and the report are what a parsed re-import gives. */

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const MORNING_MS = Date.UTC(2024, 4, 1, 7, 30)
const EVENING_MS = Date.UTC(2024, 4, 1, 18, 30)

function run(startMs: number, speed = 3) {
  return {
    sport: 'running' as const,
    startMs,
    durationS: 120,
    records: secondly(startMs, 120, { speed, altitude: 50, heartRate: 150 }),
  }
}
const fit = (name: string, startMs: number, speed?: number) =>
  new File([new Uint8Array(buildFit({ sessions: [run(startMs, speed)] }))], name)

/** An index that remembers what it was told, keyed by the file's bytes, and counts its calls. */
function index() {
  const entries = new Map<string, HeldEntry>()
  const calls = {
    parsed: 0,
    ids: [] as FileId[],
    metas: [] as string[],
    /** Files asked about that were not parsed. */
    get skipped() {
      return this.ids.length - this.parsed
    },
  }
  const keyOf = (f: FileId) => `${f.hash}|${f.size}`
  const held: HeldFiles = {
    async skip(file) {
      calls.ids.push(file)
      return entries.get(keyOf(file)) ?? null
    },
    note(file, keys, meta) {
      calls.parsed++
      calls.metas.push(meta)
      entries.set(keyOf(file), { keys, meta })
    },
  }
  return { held, calls }
}

async function importWith(
  session: AnalysisSession,
  files: File[],
  held?: HeldFiles,
  sink?: SyncSink,
) {
  let duplicates: unknown = null
  let outcome: unknown = null
  const state = await session.addFiles(
    files,
    SETTINGS,
    undefined,
    sink,
    false,
    (done) => {
      duplicates = done.duplicates
      outcome = {
        activities: done.activities,
        filesAdded: done.filesAdded,
        rejected: done.rejected,
      }
    },
    undefined,
    undefined,
    held,
  )
  return { state, duplicates, outcome }
}

describe('an import that skips the files its index knows', () => {
  const files = () => [fit('a.fit', MORNING_MS), fit('b.fit', EVENING_MS, 3.5)]

  it('parses nothing the second time, and reports as a parsed re-import does', async () => {
    const { held, calls } = index()
    const session = new AnalysisSession()
    await importWith(session, files(), held)
    expect(calls).toMatchObject({ parsed: 2, skipped: 0 })

    const again = await importWith(session, files(), held)
    expect(calls).toMatchObject({ parsed: 2, skipped: 2 })

    const control = new AnalysisSession()
    await importWith(control, files())
    const parsedAgain = await importWith(control, files())
    expect(again.outcome).toEqual(parsedAgain.outcome)
    expect(again.duplicates).toEqual(parsedAgain.duplicates)
    expect(again.state.library).toEqual(parsedAgain.state.library)
  })

  it('parses a file with the same name and different bytes', async () => {
    const { held, calls } = index()
    const session = new AnalysisSession()
    await importWith(session, [fit('a.fit', MORNING_MS)], held)
    await importWith(session, [fit('a.fit', MORNING_MS, 4)], held)
    expect(calls).toMatchObject({ parsed: 2, skipped: 0 })
  })

  it('parses a file whose workout is no longer held', async () => {
    const { held, calls } = index()
    const session = new AnalysisSession()
    await importWith(session, [fit('a.fit', MORNING_MS)], held)
    session.clear()
    const again = await importWith(session, [fit('a.fit', MORNING_MS)], held)
    expect(calls).toMatchObject({ parsed: 2, skipped: 0 })
    expect(again.state.library).toHaveLength(1)
  })

  it('parses a held file that is waiting to be saved, so the save is tried again', async () => {
    const { held, calls } = index()
    const session = new AnalysisSession()
    const failing: SyncSink = async () => {
      throw new Error('offline')
    }
    await importWith(session, [fit('a.fit', MORNING_MS)], held, failing)
    const saved: string[] = []
    await importWith(session, [fit('a.fit', MORNING_MS)], held, async (item) => {
      saved.push(item.fileName)
    })
    expect(calls.skipped).toBe(0)
    expect(calls.parsed).toBe(2)
    expect(saved).toEqual(['a.fit'])
  })

  it('names the list in the key: the same bytes under a different list name are a different file', async () => {
    const { held, calls } = index()
    const bytes = new Uint8Array(buildFit({ sessions: [run(MORNING_MS)] }))
    const zipOf = (name: string) =>
      new File(
        [
          new Uint8Array(
            zipSync({
              'activities/1001.fit': bytes,
              'activities.csv': strToU8(`Activity Name,Filename\n${name},activities/1001.fit\n`),
            }),
          ),
        ],
        'export.zip',
      )
    const session = new AnalysisSession()
    await importWith(session, [zipOf('Morning run')], held)
    await importWith(session, [zipOf('Morning run')], held)
    await importWith(session, [zipOf('Long run')], held)
    expect(calls).toMatchObject({ parsed: 2, skipped: 1 })
    // What the list said is kept as a signature, never as the name.
    expect(new Set(calls.metas).size).toBe(2)
    for (const meta of calls.metas) expect(meta).not.toMatch(/run|csv/i)
  })

  it('skips a file it has just read in the same import, when an export holds it twice', async () => {
    const { held, calls } = index()
    const session = new AnalysisSession()
    await importWith(session, [fit('a.fit', MORNING_MS), fit('copy-of-a.fit', MORNING_MS)], held)
    expect(calls).toMatchObject({ parsed: 1, skipped: 1 })
  })

  it('parses a file whose digest is of another model revision, whatever the index says', async () => {
    const { held, calls } = index()
    const session = new AnalysisSession()
    await importWith(session, [fit('a.fit', MORNING_MS)], held)
    // A digest of an older model held beside current ones (a revision that can be mixed): the index does not vouch for it.
    const digests = (session as unknown as { digests: Map<string, ActivityDigest> }).digests
    for (const [key, digest] of digests)
      digests.set(key, { ...digest, modelRevision: MODEL_REVISION - 1 })
    await importWith(session, [fit('a.fit', MORNING_MS)], held)
    expect(calls).toMatchObject({ parsed: 2, skipped: 0 })
  })

  it('reads a file of two activities only when both are held', async () => {
    const { held, calls } = index()
    const both = () =>
      new File(
        [new Uint8Array(buildFit({ sessions: [run(MORNING_MS), run(EVENING_MS, 3.5)] }))],
        'day.fit',
      )
    const session = new AnalysisSession()
    await importWith(session, [both()], held)
    expect(calls.parsed).toBe(1)
    await importWith(session, [both()], held)
    expect(calls).toMatchObject({ parsed: 1, skipped: 1 })
    session.removeActivity('run', EVENING_MS, SETTINGS)
    await importWith(session, [both()], held)
    expect(calls.parsed).toBe(2)
  })
})
