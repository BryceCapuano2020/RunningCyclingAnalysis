/// <reference lib="webworker" />
import { MAX_FILE_BYTES } from '@rca/contract'
import { AnalysisSession } from '@rca/core/session'
import type { SessionState, SyncItem } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import { createActivity, listActivities, uploadFile } from '../api/client'
import type { WorkerRequest, WorkerResponse } from './protocol'

const session = new AnalysisSession()
const post = (message: WorkerResponse) => self.postMessage(message)

/** Runs one import: each new activity is saved, and its file uploaded when files are kept. */
function addFiles(request: Extract<WorkerRequest, { type: 'addFiles' }>): Promise<SessionState> {
  const { sync } = request
  let filesRead = 0
  let uploaded = 0
  const report = () =>
    post({
      type: 'progress',
      filesRead,
      ...(sync?.keepFiles ? { uploaded } : {}),
    })

  const save = async (item: SyncItem): Promise<void> => {
    const { record } = await createActivity(item.digest, item.fileName, item.fileHash)
    if (!sync?.keepFiles || record.hasFile || item.bytes.byteLength > MAX_FILE_BYTES) return
    await uploadFile(record.id, item.bytes)
    uploaded++
    report()
  }

  return session.addFiles(
    request.files,
    request.settings,
    (count) => {
      filesRead = count
      report()
    },
    sync === null ? undefined : save,
  )
}

async function handle(request: WorkerRequest): Promise<SessionState> {
  switch (request.type) {
    case 'addFiles':
      return addFiles(request)
    case 'loadSample':
      return session.loadSample(request.settings)
    case 'loadServer':
      return loadServer(request.settings)
    case 'setSettings':
      return session.setSettings(request.settings)
    case 'setRange':
      return session.setRange(request.rangeDays, request.settings)
    case 'clear':
      return session.clear()
  }
}

/** Fetches the account's digests here, so a large library never crosses the main thread. */
async function loadServer(settings: AthleteSettings): Promise<SessionState> {
  const records = await listActivities()
  return session.loadDigests(
    records.map((record) => record.digest),
    settings,
  )
}

// Requests are handled strictly in order so a settings change cannot overtake a file import.
let queue: Promise<void> = Promise.resolve()
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  queue = queue.then(async () => {
    try {
      post({ type: 'state', state: await handle(event.data) })
    } catch (error) {
      post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  })
}
