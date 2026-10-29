import type { Rejection } from '../import/result'
import { ARCHIVE_FAILED, corrupt, DAMAGED_DIRECTORY } from './archiveReasons'
import type { StreamTail } from './streamTail'
import { isEmptyZip, listedEntries } from './zipDirectory'
import type { ZipRun } from './zipRun'

/** What a zip's reader saw of its stream, for checking it once the stream has ended. */
export interface StreamSeen {
  name: string
  streamFailure: Rejection | null
  interruption: Rejection | null
  sawEntry: boolean
  archivePrefix: Uint8Array
  seenEntries: number
  tail: StreamTail
}

/** Reports a stream that failed, or whose entries the central directory lists more of than were read. */
export async function checkStream({ sink, budget }: ZipRun, seen: StreamSeen): Promise<void> {
  const { name, streamFailure, interruption, sawEntry, archivePrefix, seenEntries, tail } = seen
  if (streamFailure !== null) {
    sink.onError(name, streamFailure)
  } else if (!sawEntry && !isEmptyZip(archivePrefix)) {
    sink.onError(name, corrupt(ARCHIVE_FAILED))
  }
  // A corrupt local header ends fflate's scan silently, so compare with the central directory.
  if (budget.abort === null && interruption === null && (sawEntry || isEmptyZip(archivePrefix))) {
    const end = tail.bytes()
    const listed = await listedEntries(end, tail.streamed - end.length)
    if (listed === null) {
      sink.onError(name, corrupt(DAMAGED_DIRECTORY))
    } else if (listed > seenEntries) {
      const lost = listed - seenEntries
      sink.onError(
        name,
        corrupt(`${lost} entries could not be read because the archive is damaged`, lost),
      )
    }
  }
}
