import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { encodeFit } from '@rca/core/fit'
import { sampleDataset } from '@rca/core/synthetic'
import { gzipSync, strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeviceLibrary } from './deviceLibrary'
import type { WorkerRequest, WorkerResponse } from './protocol'

/** The athlete's labels from an export's list on the library a signed-out visitor keeps in this browser (D12 section 2.4). */

const kept = vi.hoisted(() => ({ library: null as DeviceLibrary | null }))
vi.mock('./deviceLibrary', async () => {
  const { memoryDeviceLibrary } = await import('../test/deviceLibrary.fake')
  return {
    openDeviceLibrary: () => {
      kept.library ??= memoryDeviceLibrary()
      return kept.library
    },
  }
})

const SETTINGS = { massKg: 75, bikeMassKg: 9 }
const [run] = sampleDataset().activities
if (run === undefined) throw new Error('The sample has no activities')
const RUN_FILE_BYTES = new Uint8Array(encodeFit(run, { gps: true }))

/** An export of one run, which the list calls a hike. */
function hikeExport(): File {
  const csv = strToU8(
    'Activity ID,Activity Name,Activity Type,Filename\n1,Lunch,Hike,activities/1.fit.gz\n',
  )
  return new File(
    [
      new Uint8Array(
        zipSync({ 'activities/1.fit.gz': gzipSync(RUN_FILE_BYTES), 'activities.csv': csv }),
      ),
    ],
    'export.zip',
  )
}

async function startWorker() {
  const posted: WorkerResponse[] = []
  const fakeSelf = {
    postMessage: (message: WorkerResponse) => posted.push(message),
    onmessage: null as ((event: MessageEvent<WorkerRequest>) => void) | null,
  }
  vi.stubGlobal('self', fakeSelf)
  await import('./analysis.worker')
  async function send(request: WorkerRequest): Promise<WorkerResponse[]> {
    const start = posted.length
    fakeSelf.onmessage?.({ data: request } as MessageEvent<WorkerRequest>)
    await vi.waitFor(() => {
      const last = posted.at(-1)
      if (posted.length === start || (last?.type !== 'state' && last?.type !== 'error')) {
        throw new Error('still working')
      }
    }, 10_000)
    return posted.slice(start)
  }
  return { send }
}

/**
 * The run on its own, before the export: from revision 7 a new import carries the label its own list gives, so the
 * workouts the list is applied to afterwards are the ones the library held without one.
 */
const importBare = (): WorkerRequest => ({
  type: 'addFiles',
  files: [new File([RUN_FILE_BYTES], 'activities/1.fit')],
  settings: SETTINGS,
  sync: null,
  saveToDevice: true,
})

const importHikes = (): WorkerRequest => ({
  type: 'addFiles',
  files: [hikeExport()],
  settings: SETTINGS,
  sync: null,
  saveToDevice: true,
})
const undo: WorkerRequest = { type: 'undoLabels', settings: SETTINGS, userId: null }

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.resetModules()
  kept.library = null
})

afterEach(() => {
  vi.doUnmock('./labelsConfig')
})

describe('an import into the library kept in this browser, of an export whose list labels a workout', () => {
  it('changes nothing while the labels are off: no label, no count, the workout stays in the analysis', async () => {
    const { send } = await startWorker()
    await send(importBare())
    const reply = (await send(importHikes())).at(-1)
    expect(reply).toMatchObject({ type: 'state', state: { totalActivities: 1 } })
    expect(reply).not.toHaveProperty('outcome.labelled')
    expect(reply).not.toHaveProperty('state.labelledRuns')
    const rows = await kept.library!.all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.digest).not.toHaveProperty('athleteType')
  })

  describe('with the labels switched on', () => {
    async function importLabelled() {
      vi.doMock('./labelsConfig', () => ({ ATHLETE_LABELS_ENABLED: true }))
      const worker = await startWorker()
      await worker.send(importBare())
      const messages = await worker.send(importHikes())
      return { ...worker, messages }
    }

    it('labels the kept workout a hike, tells the summary how many, and leaves it out of the analysis', async () => {
      const { messages } = await importLabelled()
      expect(messages.at(-1)).toMatchObject({
        type: 'state',
        outcome: { labelled: 1 },
        state: { labelledRuns: 1, totalActivities: 0 },
      })
      const rows = await kept.library!.all()
      expect(rows).toHaveLength(1)
      expect(rows[0]!.digest.athleteType).toBe('hike')
    })

    it('keeps the label across a reload of the page', async () => {
      const { send } = await importLabelled()
      const reloaded = await send({ type: 'loadDevice', settings: SETTINGS, reload: true })
      expect(reloaded.at(-1)).toMatchObject({
        state: { labelledRuns: 1, totalActivities: 0 },
      })
    })

    it('takes the label off on Undo, in the kept row too, and puts the workout back in the analysis', async () => {
      const { send } = await importLabelled()
      const undone = await send(undo)
      expect(undone.at(-1)).toMatchObject({ type: 'state', state: { totalActivities: 1 } })
      expect(undone.at(-1)).not.toHaveProperty('state.labelledRuns')
      expect(undone.at(-1)).not.toHaveProperty('labelsLeft')
      expect((await kept.library!.all())[0]!.digest).not.toHaveProperty('athleteType')
      const reloaded = await send({ type: 'loadDevice', settings: SETTINGS, reload: true })
      expect(reloaded.at(-1)).toMatchObject({ state: { totalActivities: 1 } })
    })

    it('undoes once: a second Undo changes nothing', async () => {
      const { send } = await importLabelled()
      await send(undo)
      const second = await send(undo)
      expect(second.at(-1)).toMatchObject({ state: { totalActivities: 1 } })
      expect(second.at(-1)).not.toHaveProperty('labelsLeft')
    })

    it('does not undo labels the page no longer shows: after the library is loaded again, or removed', async () => {
      const { send } = await importLabelled()
      await send({ type: 'loadDevice', settings: SETTINGS, reload: true })
      const stale = await send(undo)
      // The reload made the labels stale: they stand.
      expect(stale.at(-1)).toMatchObject({ state: { labelledRuns: 1 } })
      expect((await kept.library!.all())[0]!.digest.athleteType).toBe('hike')
      await send({ type: 'clear', forgetDevice: true })
      expect(await kept.library!.all()).toEqual([])
      const cleared = await send(undo)
      expect(cleared.at(-1)).toMatchObject({ state: { totalActivities: 0 } })
    })

    it('leaves a label the athlete has since set otherwise as it is', async () => {
      const { send } = await importLabelled()
      const [row] = await kept.library!.all()
      await kept.library!.setLabel(row!.workoutKey, row!.digest.id, {
        from: 'hike',
        athleteType: 'walk',
      })
      const undone = await send(undo)
      expect(undone.at(-1)).toMatchObject({ labelsLeft: 1 })
      expect((await kept.library!.all())[0]!.digest.athleteType).toBe('walk')
    })

    it('does not label files that are analysed and kept nowhere', async () => {
      vi.doMock('./labelsConfig', () => ({ ATHLETE_LABELS_ENABLED: true }))
      const { send } = await startWorker()
      const reply = (
        await send({
          type: 'addFiles',
          files: [hikeExport()],
          settings: SETTINGS,
          sync: null,
        })
      ).at(-1)
      // Nothing held was labelled (no count of labels applied). The file's own list type is in its digest from revision 7,
      // so it is left out of the analysis as a new import is, and it is kept nowhere.
      expect(reply).not.toHaveProperty('outcome.labelled')
      expect(reply).toMatchObject({ state: { totalActivities: 0, labelledRuns: 1 } })
      expect(await kept.library!.all()).toEqual([])
    })
  })
})
