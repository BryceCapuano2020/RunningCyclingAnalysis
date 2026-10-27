import { throttled } from './progressThrottle'
import type { Throttled } from './progressThrottle'
import type { WorkerResponse } from './protocol'

/**
 * What an import tells the page while it runs: the files read, and the activities saved when the
 * import saves to the account. Messages go out about four a second, and the last is always exact.
 */
export class ImportReporter {
  private filesRead = 0
  private saved = 0
  private readonly progress: Throttled<WorkerResponse>
  private readonly filesTotal: number | null
  private readonly countsSaves: boolean

  /** `filesTotal` is the activity files the import holds, when that is known before they are read. */
  constructor(
    post: (message: WorkerResponse) => void,
    filesTotal: number | null,
    countsSaves: boolean,
  ) {
    this.progress = throttled(post)
    this.filesTotal = filesTotal
    this.countsSaves = countsSaves
  }

  /** Reported before any file is read, so an import that saves nothing still starts and ends. */
  begin(): void {
    if (this.countsSaves) this.report()
  }

  filesReadSoFar(count: number): void {
    this.filesRead = count
    this.report()
  }

  activitySaved(): void {
    this.saved++
    this.report()
  }

  /** A rate limit holds the saves back. Sent at once, so the page says so before the wait. */
  savesPaused(): void {
    this.report(true)
  }

  /** The import is over: the page ends on the exact counts, however the messages were spaced. */
  end(): void {
    this.progress.flush()
  }

  /** The import failed: nothing is sent after the failure that was waiting to go out. */
  abandon(): void {
    this.progress.cancel()
  }

  private report(paused = false): void {
    // The last file ends the count, so it is sent at once, before the analysis of the library.
    const lastFile = this.filesTotal !== null && this.filesRead >= this.filesTotal
    this.progress.report(
      {
        type: 'progress',
        filesRead: this.filesRead,
        ...(this.filesTotal === null ? {} : { filesTotal: this.filesTotal }),
        ...(this.countsSaves ? { uploaded: this.saved } : {}),
        ...(paused ? { paused: true as const } : {}),
      },
      paused || lastFile,
    )
  }
}
