import { concat } from '../bytes'
import { DIRECTORY_TAIL_BYTES } from './zipDirectory'

/** The end of a stream, kept as it passes by: enough of it to hold a zip's central directory. */
export class StreamTail {
  /** Bytes pushed so far, kept or not. */
  streamed = 0
  private chunks: Uint8Array[] = []
  private length = 0

  /**
   * Keeps a piece, which the caller must not change, and lets go of the oldest that no longer reaches the
   * tail. Returns how many bytes it now holds more (less, if negative) than before.
   */
  push(piece: Uint8Array): number {
    const before = this.length
    this.streamed += piece.length
    this.chunks.push(piece)
    this.length += piece.length
    while (this.chunks.length > 1) {
      const oldest = this.chunks[0]
      if (oldest === undefined || this.length - oldest.length < DIRECTORY_TAIL_BYTES) break
      this.chunks.shift()
      this.length -= oldest.length
    }
    return this.length - before
  }

  /** Lets go of everything held, and returns how many bytes that was. */
  release(): number {
    const held = this.length
    this.chunks = []
    this.length = 0
    return held
  }

  /** The last DIRECTORY_TAIL_BYTES streamed, or all of it when it is shorter. */
  bytes(): Uint8Array {
    const all = concat(this.chunks, this.length)
    return all.subarray(Math.max(0, all.length - DIRECTORY_TAIL_BYTES))
  }
}
