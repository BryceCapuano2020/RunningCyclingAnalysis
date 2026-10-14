/// <reference lib="webworker" />
import { AnalysisSession } from '../core/session'
import type { SessionState } from '../core/session'
import type { WorkerRequest, WorkerResponse } from './protocol'

const session = new AnalysisSession()
const post = (message: WorkerResponse) => self.postMessage(message)

async function handle(request: WorkerRequest): Promise<SessionState> {
  switch (request.type) {
    case 'addFiles':
      return session.addFiles(request.files, request.settings, (filesRead) =>
        post({ type: 'progress', filesRead }),
      )
    case 'loadSample':
      return session.loadSample(request.settings)
    case 'setSettings':
      return session.setSettings(request.settings)
    case 'setRange':
      return session.setRange(request.rangeDays, request.settings)
    case 'clear':
      return session.clear()
  }
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
