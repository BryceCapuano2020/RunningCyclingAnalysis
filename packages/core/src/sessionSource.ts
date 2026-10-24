import { countActivityFiles, extractFitFiles } from './fit'
import type { ExtractLimits, RangedSource } from './fit'
import { ACTIVITY } from './fit/zipDirectory'
import { parseActivityFile } from './import'
import { entryKey, readActivityNames } from './import/activitiesCsv'
import { sha256Hex } from './sha256'
import type { Activity } from './types'

/** The files an import has read so far, across all of its sources, and the progress callback. */
export interface ImportProgress {
  filesRead: number
  onProgress?: (filesRead: number) => void
}

/** What one import records as it reads its sources. */
export interface SourceImport {
  limits: ExtractLimits
  progress: ImportProgress
  outcome: { activities: number; rejected: number }
  /** Rejections by file name, shared by the import. */
  rejected: Map<string, string>
  /** Activity files the sources hold in formats the app does not read, by source name. */
  unsupported: Map<string, number>
  /** Whether each file's bytes are hashed, which the sink needs. */
  hashFiles: boolean
  /** Considers one parsed activity of an imported file. */
  consider: (
    activity: Activity,
    file: { fileName: string; fileHash: string; bytes: Uint8Array },
  ) => Promise<void>
}

/** Counts one more file as read, and reports the count. */
function countRead(progress: ImportProgress): void {
  progress.filesRead++
  progress.onProgress?.(progress.filesRead)
}

/**
 * Imports one source (a file, or a zip and every activity file in it) into the import's state. The
 * source's activity names are read before its files, and its list's inflated bytes count against the
 * source's decompressed-bytes budget.
 */
export async function importSource(source: RangedSource, ctx: SourceImport): Promise<void> {
  const { progress, outcome } = ctx
  let undecodable = 0
  const readBefore = progress.filesRead
  // The export's names are read before its files, which may sit anywhere in the zip. The list's
  // inflated bytes count against the source's decompressed-bytes budget, as the files' do.
  const listed = await readActivityNames(source, ctx.limits)
  const extractLimits = {
    ...ctx.limits,
    maxTotalDecompressedBytes:
      ctx.limits.maxTotalDecompressedBytes - (listed?.decompressedBytes ?? 0),
  }
  const summary = await extractFitFiles(
    source,
    async (file) => {
      const parsed = parseActivityFile(file.bytes, file.fileName, undefined, {
        activityName: listed?.names.get(entryKey(file.fileName)),
      })
      if (parsed.ok) {
        outcome.activities += parsed.activities.length
        const fileHash = ctx.hashFiles ? await sha256Hex(file.bytes) : ''
        const imported = { fileName: file.fileName, fileHash, bytes: file.bytes }
        for (const activity of parsed.activities) await ctx.consider(activity, imported)
        // A file that now reads cleanly replaces an earlier rejection under the same name.
        ctx.rejected.delete(file.fileName)
        ctx.rejected.delete(`${file.fileName}.gz`)
      } else {
        outcome.rejected++
        ctx.rejected.set(parsed.fileName, parsed.reason)
      }
      countRead(progress)
    },
    (fileName, reason) => {
      undecodable++
      outcome.rejected++
      ctx.rejected.set(fileName, reason)
      // An activity file that could not be read was still read, so progress reaches its total.
      if (ACTIVITY.test(fileName)) countRead(progress)
    },
    extractLimits,
  )
  // An archive that stops early, or loses an entry, reports nothing for the files it did not
  // reach. They count as read here, up to the total its directory lists.
  const expected = (await countActivityFiles([source])) ?? 0
  for (let left = expected - (progress.filesRead - readBefore); left > 0; left--)
    countRead(progress)
  ctx.unsupported.set(source.name, summary.otherActivityFiles)
  outcome.rejected += summary.otherActivityFiles
  // A corrupt file is already reported under its own name, so do not also call it empty.
  if (summary.fitFiles === 0 && summary.otherActivityFiles === 0 && undecodable === 0) {
    outcome.rejected++
    ctx.rejected.set(source.name, 'No supported activity files found (FIT, GPX or TCX)')
  }
}
