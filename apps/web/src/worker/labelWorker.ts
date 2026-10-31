import type { ActivityRecord } from '@rca/contract'
import type { AnalysisSession } from '@rca/core/session'
import type { DeviceActions } from './device'
import { deviceLabels } from './deviceLabels'
import type { DeviceLibrary } from './deviceLibrary'
import { LabelUndo } from './labelUndo'
import { undoLabelsRequest } from './undoLabelsRequest'
import type { WorkerView } from './workerView'

/**
 * The labels an import's export list put on the workouts, on either library, and what takes them off again: what the
 * import run applies (`deviceLabels`, `labelUndo`) and the Undo request (`undo`).
 */
export function labelWorker(deps: {
  session: AnalysisSession
  deviceLibrary: DeviceLibrary
  device: DeviceActions
  savedRecords: Map<string, ActivityRecord>
  view: WorkerView
  reportLibrary: () => void
}) {
  const { session, deviceLibrary, device, savedRecords, view, reportLibrary } = deps
  const labelUndo = new LabelUndo()
  const labelling = deviceLabels(session, deviceLibrary, device)
  const context = {
    labelUndo,
    session,
    savedRecords,
    deviceLabels: labelling,
    epoch: () => view.libraryEpoch,
    reportLibrary,
  }
  return {
    labelUndo,
    deviceLabels: labelling,
    undo: (request: Parameters<typeof undoLabelsRequest>[1]) => undoLabelsRequest(context, request),
  }
}
