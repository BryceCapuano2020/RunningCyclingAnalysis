import { Unzip, UnzipPassThrough } from 'fflate'
import type { AsyncFlateStreamHandler, UnzipDecoder, UnzipDecoderConstructor } from 'fflate'
import { StoppableInflate } from './stoppableInflate'

/**
 * Every compression method a zip entry can name is a 16-bit number, and this build reads two of them:
 * stored (0) and deflate (8). fflate keeps the compressed input of an entry whose method it has no
 * decoder for, for as long as the entry lasts, so a skipped entry in any other method (shrink, implode,
 * deflate64, bzip2, LZMA, zstd, WinZip's AES wrapper at 99, or a number nobody has assigned) would be
 * held in memory whole. A decoder that takes the input and drops it lets the entry be started and
 * drained. One is registered for each method as an entry names it, so all 65,534 are covered without
 * keeping a table of them in every unzipper.
 */
const discarding = new Map<number, UnzipDecoderConstructor>()

/** The decoder for one method that reads nothing: it never gives output, so nothing is inflated or kept. */
export function discardingDecoder(method: number): UnzipDecoderConstructor {
  const known = discarding.get(method)
  if (known !== undefined) return known
  const decoder = class DiscardingDecoder implements UnzipDecoder {
    static compression = method
    ondata: AsyncFlateStreamHandler = () => undefined
    push(): void {
      // The input of an entry that cannot be read is dropped as it arrives.
    }
  }
  discarding.set(method, decoder)
  return decoder
}

/** Every decoder a zip reader reads with: stored and deflate. The others are added as entries name them. */
export function registerDecoders(unzip: Unzip): void {
  unzip.register(UnzipPassThrough)
  unzip.register(StoppableInflate)
}

/** Makes sure an entry in any method but stored and deflate can be started and drained. */
export function registerDiscarder(unzip: Unzip, method: number): void {
  if (method !== UnzipPassThrough.compression && method !== StoppableInflate.compression) {
    unzip.register(discardingDecoder(method))
  }
}
