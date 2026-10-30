import { Inflate } from 'fflate'
import type { AsyncFlateStreamHandler, FlateError, UnzipDecoder } from 'fflate'

/**
 * A deflate decoder for zip entries that can be stopped. fflate's own synchronous one cannot, so an
 * entry the reader has given up on (one past its size limit, or a skipped one that inflates past its
 * budget) would go on inflating every byte it is still sent. Once stopped, this one ignores them.
 */
export class StoppableInflate implements UnzipDecoder {
  static compression = 8

  /**
   * Set while an entry that is already given up on is being started: the decoder it gets is made stopped,
   * so the first piece of its input, which fflate pushes at once, is not inflated either.
   */
  static startStopped = false

  ondata: AsyncFlateStreamHandler = () => undefined
  private stopped = StoppableInflate.startStopped
  private readonly inflate = new Inflate((data, final) => {
    this.ondata(null, data, final)
  })

  push(chunk: Uint8Array, final: boolean): void {
    if (this.stopped) return
    try {
      this.inflate.push(chunk, final)
    } catch (error) {
      // As fflate's own decoder does: corrupt data is the entry's error, not the archive's.
      // Inflate throws only the FlateError it builds, which carries the code the type names.
      this.ondata(error as FlateError, new Uint8Array(0), final)
    }
  }

  terminate(): void {
    this.stopped = true
  }
}
