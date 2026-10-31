import type { CountedRunsController } from '../ui/useCountedRuns'
import { vi } from 'vitest'
import type { SessionState } from '@rca/core/session'
import { EMPTY_SESSION } from '../ui/analysis/model'
import type { RouteReply } from '../ui/routeReply'
import type { AnalysisController } from '../ui/useAnalysis'

export interface AnalysisStubOverrides extends Partial<Omit<AnalysisController, 'state'>> {
  state?: Partial<SessionState>
}

/**
 * An idle analysis controller with an empty session, for tests. Every action is a mock, so a test
 * can assert on it. Pass only the fields a test cares about.
 */
export function analysisStub({ state, ...rest }: AnalysisStubOverrides = {}): AnalysisController {
  return {
    state: { ...EMPTY_SESSION, ...state },
    busy: false,
    waitingReason: null,
    progress: null,
    uploading: null,
    savedCount: null,
    error: null,
    errorIssue: null,
    errorNeutral: false,
    workerStopped: false,
    stop: vi.fn(),
    retryWorker: vi.fn(),
    libraryStatus: 'idle',
    restoring: false,
    retryLibrary: vi.fn(),
    detail: null,
    missingOriginals: 0,
    outdatedWithOriginal: 0,
    libraryUnreadable: 0,
    deviceIssue: null,
    outbox: null,
    importOutcome: null,
    importChange: null,
    dismissSummary: vi.fn(),
    savedActivities: [],
    libraryAction: null,
    libraryNotice: null,
    libraryError: null,
    deleteActivity: vi.fn(),
    exportData: vi.fn(async () => new Blob()),
    activitySplits: vi.fn(async () => null),
    loadTrace: vi.fn(async () => ({ kind: 'missing' as const })),
    rebuildNotice: null,
    rebuildSavedActivities: vi.fn(),
    addFiles: vi.fn(),
    loadSample: vi.fn(),
    setRange: vi.fn(),
    clear: vi.fn(),
    loadRoute: vi.fn(async (): Promise<RouteReply> => ({ kind: 'none' })),
    ...rest,
  }
}

/** The counted-runs controller of a page that is not testing the choice: nothing is counted and nothing is kept. */
export function countedRunsStub(): CountedRunsController {
  return {
    keys: [],
    count: () => undefined,
    stop: () => undefined,
    clear: () => undefined,
    notKept: null,
    status: '',
  }
}
