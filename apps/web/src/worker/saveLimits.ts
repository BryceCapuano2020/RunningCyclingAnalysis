/** Creates sent to the server at once. The write limiter allows 600 a minute, and each is a short request. */
export const SAVE_CONCURRENCY = 3
/** Original files uploaded at once: the server holds two upload slots per account. */
export const UPLOAD_CONCURRENCY = 2
/** Saves started and not yet finished, including those waiting for a turn. */
export const MAX_SAVES_IN_FLIGHT = 6
/** The bytes of the files those saves hold, so a library of large files stays flat in memory. */
export const MAX_BYTES_IN_FLIGHT = 48 * 1024 * 1024

/** Runs at most `limit` tasks at once; the rest wait their turn in order. */
export class Gate {
  private active = 0
  private readonly waiting: (() => void)[] = []
  private readonly limit: number

  constructor(limit: number) {
    this.limit = limit
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    // A finished task hands its place to the next in line, so the count never rises above the limit.
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.waiting.push(resolve))
    else this.active++
    try {
      return await task()
    } finally {
      const next = this.waiting.shift()
      if (next === undefined) this.active--
      else next()
    }
  }
}

/**
 * How much work may be started and not finished: a number of saves and a number of bytes. `enter` waits until
 * there is room, always admitting one when nothing is in flight, so a single large file cannot wait forever.
 */
export class Room {
  private saves = 0
  private bytes = 0
  private readonly waiting: (() => void)[] = []
  private readonly maxSaves: number
  private readonly maxBytes: number

  constructor(maxSaves: number, maxBytes: number) {
    this.maxSaves = maxSaves
    this.maxBytes = maxBytes
  }

  private fits(bytes: number): boolean {
    return this.saves === 0 || (this.saves < this.maxSaves && this.bytes + bytes <= this.maxBytes)
  }

  async enter(bytes: number): Promise<void> {
    while (!this.fits(bytes)) await new Promise<void>((resolve) => this.waiting.push(resolve))
    this.saves++
    this.bytes += bytes
  }

  leave(bytes: number): void {
    this.saves--
    this.bytes -= bytes
    for (const wake of this.waiting.splice(0)) wake()
  }
}
