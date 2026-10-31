import type { SampleClock } from '@rca/core/synthetic'
import { deviceClock } from './sampleClock'
import type { CheckinScope } from './checkinStore'
import type { TraceScope } from './workbenchStore'

/** What the worker is showing, shared by the request handlers and the import run. */
export interface WorkerView {
  /** The exact library scope this worker is currently allowed to answer details for. */
  activeScope: TraceScope | null
  /** Where the check-in of the library on screen is kept: null for the sample and for files that are kept nowhere. */
  checkinScope: CheckinScope | null
  /** The sample is shown in place of the library kept in this browser, never added to it. */
  showingSample: boolean
  /** The clock the sample on screen was drawn with, so a recording drawn later is of the same activity. */
  sampleClock: SampleClock
}

export function newWorkerView(): WorkerView {
  return { activeScope: null, checkinScope: null, showingSample: false, sampleClock: deviceClock() }
}
