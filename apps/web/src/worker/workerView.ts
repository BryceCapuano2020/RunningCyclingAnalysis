import type { SampleClock } from '@rca/core/synthetic'
import { deviceClock } from './sampleClock'
import type { TraceScope } from './workbenchStore'

/** What the worker is showing, shared by the request handlers and the import run. */
export interface WorkerView {
  /** The exact library scope this worker is currently allowed to answer details for. */
  activeScope: TraceScope | null
  /** The sample is shown in place of the library kept in this browser, never added to it. */
  showingSample: boolean
  /** The clock the sample on screen was drawn with, so a recording drawn later is of the same activity. */
  sampleClock: SampleClock
  /**
   * Rises each time the library the session holds is replaced or emptied (a load, a sample, a clear). A
   * long job notes it when it starts and discards its results if it has moved.
   */
  libraryEpoch: number
}

export function newWorkerView(): WorkerView {
  return { activeScope: null, showingSample: false, sampleClock: deviceClock(), libraryEpoch: 0 }
}
