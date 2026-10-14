import { Unzip, UnzipInflate, UnzipPassThrough, gunzipSync } from 'fflate'

export interface FitFile {
  fileName: string
  bytes: Uint8Array
}

/** A browser File satisfies this. */
export interface FitSource {
  name: string
  stream(): ReadableStream<Uint8Array>
  arrayBuffer(): Promise<ArrayBuffer>
}

export interface ExtractSummary {
  /** FIT files delivered to onFile. */
  fitFiles: number
  /** GPX and TCX files seen and skipped. */
  otherActivityFiles: number
}

export type FitFileHandler = (file: FitFile) => void | Promise<void>

const OTHER_ACTIVITY = /\.(gpx|tcx)(\.gz)?$/i
const FIT = /\.fit(\.gz)?$/i

/**
 * Calls onFile for every FIT file in the source: a .fit, a .fit.gz, or the FIT entries of a zip,
 * which is read as a stream so a large export never has to fit in memory. Resolves with counts
 * once the source is exhausted. Corrupt or truncated archives resolve with what was extracted
 * before the damage. Never rejects for bad data; errors thrown by onFile propagate.
 */
export async function extractFitFiles(
  source: FitSource,
  onFile: FitFileHandler,
): Promise<ExtractSummary> {
  const summary: ExtractSummary = { fitFiles: 0, otherActivityFiles: 0 }
  const name = source.name
  if (OTHER_ACTIVITY.test(name)) {
    summary.otherActivityFiles = 1
  } else if (FIT.test(name)) {
    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await source.arrayBuffer())
    } catch {
      return summary
    }
    await emitFit(name, bytes, summary, onFile)
  } else if (/\.zip$/i.test(name)) {
    await streamZip(source, summary, onFile)
  }
  return summary
}

async function streamZip(
  source: FitSource,
  summary: ExtractSummary,
  onFile: FitFileHandler,
): Promise<void> {
  const ready: { name: string; bytes: Uint8Array }[] = []
  const unzip = new Unzip((file) => {
    const entry = file.name
    if (isIgnored(entry)) return
    if (OTHER_ACTIVITY.test(entry)) {
      summary.otherActivityFiles++
      return
    }
    if (!FIT.test(entry)) return
    const chunks: Uint8Array[] = []
    let failed = false
    file.ondata = (err, data, final) => {
      if (err) {
        failed = true
        return
      }
      chunks.push(data.slice())
      if (final && !failed) ready.push({ name: entry, bytes: concat(chunks) })
    }
    try {
      file.start()
    } catch {
      // Unsupported compression method: skip this entry.
    }
  })
  unzip.register(UnzipPassThrough)
  unzip.register(UnzipInflate)

  let reader: ReadableStreamDefaultReader<Uint8Array>
  try {
    reader = source.stream().getReader()
  } catch {
    return
  }

  let ended = false
  let broken = false
  while (!ended && !broken) {
    try {
      const step = await reader.read()
      if (step.done) {
        unzip.push(new Uint8Array(0), true)
        ended = true
      } else {
        unzip.push(step.value, false)
      }
    } catch {
      broken = true
    }
    for (const entry of ready.splice(0)) {
      await emitFit(entry.name, entry.bytes, summary, onFile)
    }
  }
  if (broken) void reader.cancel().catch(() => undefined)
}

/** Delivers one FIT file, gunzipping it first when it is a .fit.gz. Skips corrupt gzip data. */
async function emitFit(
  name: string,
  bytes: Uint8Array,
  summary: ExtractSummary,
  onFile: FitFileHandler,
): Promise<void> {
  let fileName = name
  let fitBytes = bytes
  if (/\.gz$/i.test(name)) {
    try {
      fitBytes = gunzipSync(bytes)
    } catch {
      return
    }
    fileName = name.slice(0, -'.gz'.length)
  }
  summary.fitFiles++
  await onFile({ fileName, bytes: fitBytes })
}

/** Directory entries and macOS resource-fork metadata. */
function isIgnored(name: string): boolean {
  return name.endsWith('/') || /(^|\/)__MACOSX\//.test(name) || /(^|\/)\._/.test(name)
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}
