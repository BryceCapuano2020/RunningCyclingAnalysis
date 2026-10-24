import { vi } from 'vitest'
import type { SessionState } from '@rca/core/session'
import { EMPTY_SESSION } from '../ui/analysis/model'
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
    error: null,
    errorIssue: null,
    workerStopped: false,
    stop: vi.fn(),
    retryWorker: vi.fn(),
    libraryStatus: 'idle',
    retryLibrary: vi.fn(),
    missingOriginals: 0,
    libraryUnreadable: 0,
    importOutcome: null,
    importChange: null,
    dismissSummary: vi.fn(),
    savedActivities: [],
    libraryAction: null,
    libraryNotice: null,
    libraryError: null,
    deleteActivity: vi.fn(),
    exportData: vi.fn(async () => new Blob()),
    rebuildNotice: null,
    rebuildSavedActivities: vi.fn(),
    addFiles: vi.fn(),
    loadSample: vi.fn(),
    setRange: vi.fn(),
    clear: vi.fn(),
    ...rest,
  }
}
