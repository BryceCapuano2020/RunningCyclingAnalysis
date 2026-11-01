import type { Writing } from './writerResume'

/** The outbox resume the worker holds, if one is going: the slot, and the ways of stopping and starting it. */
export class ResumeHolder {
  private current: Writing | null = null

  get(): Writing | null {
    return this.current
  }

  /** Starts a resume in the slot; the one that was there is the caller's to have stopped. */
  start(make: () => Writing): Writing {
    this.current = make()
    return this.current
  }

  /** Stops the resume without waiting; its rows stay for the next one. */
  cancel(): void {
    this.current?.cancel()
    this.current = null
  }

  /** Empties the slot. */
  clear(): void {
    this.current = null
  }

  /**
   * Stops the resume and waits until it has let go of the writer lock. The slot is emptied only if it still holds the
   * resume that was waited for: a load that started a newer one meanwhile keeps it.
   */
  async end(): Promise<void> {
    const ending = this.current
    ending?.cancel()
    await ending?.finished.catch(() => undefined)
    if (this.current === ending) this.current = null
  }

  /** Starts a resume only where none is going, such as after `end` for work that held the lock, never over a newer one. */
  restart(make: () => Writing): void {
    this.current ??= make()
  }
}
