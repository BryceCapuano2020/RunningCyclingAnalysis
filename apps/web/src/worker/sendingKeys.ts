/**
 * The workouts being sent to the account right now. An import and a resume of the outbox both send, and a file added
 * again while its row is still waiting would otherwise be sent by both at once. A send of a workout that is already
 * under way waits for it to end, and the server then answers the second create from what the first made.
 */
export class SendingKeys {
  private readonly active = new Map<string, Promise<void>>()

  /** Whether a send of the workout is under way. */
  has(key: string): boolean {
    return this.active.has(key)
  }

  /** Runs the send once none of the same workout is under way. */
  async run<T>(key: string, send: () => Promise<T>): Promise<T> {
    for (let under = this.active.get(key); under !== undefined; under = this.active.get(key))
      await under
    let end: () => void = () => undefined
    this.active.set(key, new Promise<void>((resolve) => (end = resolve)))
    try {
      return await send()
    } finally {
      this.active.delete(key)
      end()
    }
  }
}
