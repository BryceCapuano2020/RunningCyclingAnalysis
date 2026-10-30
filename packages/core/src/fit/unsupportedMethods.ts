import { Unzip, UnzipPassThrough } from 'fflate'
import type { AsyncFlateStreamHandler, UnzipDecoder, UnzipDecoderConstructor } from 'fflate'
import { StoppableInflate } from './stoppableInflate'

/**
 * The compression methods zip files use that this build cannot inflate: shrink, reduce, implode,
 * deflate64, bzip2, LZMA, zstd and the others PKWARE lists, and WinZip's AES wrapper (99, and the
 * ones near it). fflate keeps the compressed input of an entry whose method it has no decoder for, for
 * as long as the entry lasts, so a skipped entry in one of these would be held in memory whole. A
 * decoder that takes the input and discards it lets the entry be started and drained.
 */
export const UNSUPPORTED_METHODS: readonly number[] = [
  1, 2, 3, 4, 5, 6, 7, 9, 10, 12, 14, 18, 19, 93, 94, 95, 96, 97, 98, 99,
]

/** A decoder for one method that reads nothing: it never gives output, so nothing is inflated or kept. */
function discardingDecoder(method: number): UnzipDecoderConstructor {
  return class DiscardingDecoder implements UnzipDecoder {
    static compression = method
    ondata: AsyncFlateStreamHandler = () => undefined
    push(): void {
      // The input of an entry that cannot be read is dropped as it arrives.
    }
  }
}

/** One decoder for each unsupported method, kept so a test can watch them. */
export const DISCARDING_DECODERS: ReadonlyMap<number, UnzipDecoderConstructor> = new Map(
  UNSUPPORTED_METHODS.map((method) => [method, discardingDecoder(method)]),
)

/** Every decoder a zip reader needs: stored, deflate, and a discarding one for each method it cannot read. */
export function registerDecoders(unzip: Unzip): void {
  unzip.register(UnzipPassThrough)
  unzip.register(StoppableInflate)
  for (const decoder of DISCARDING_DECODERS.values()) unzip.register(decoder)
}
