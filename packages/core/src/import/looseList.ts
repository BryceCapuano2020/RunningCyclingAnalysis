import type { RangedSource } from '../fit/zipDirectory'
import { readRange } from '../fit/zipDirectory'
import { parseActivityList } from './activitiesCsv'
import type { ListedActivity } from './activitiesCsv'
import { MAX_ACTIVITY_LIST_BYTES } from './limits'

/** An activities.csv given beside the activity files, in any folder, whatever its case. */
const COMPANION = /(^|[\\/])activities\.csv$/i

/** Whether a source is the list of a Strava export, given loose beside the files it names. */
export function isCompanion(name: string): boolean {
  return COMPANION.test(name)
}

/** The key a loose file is matched by: its name without folders or .gz, in lower case. */
function nameKey(path: string): string | null {
  const last = path.replace(/\\/g, '/').replace(/\.gz$/i, '').split('/').at(-1)?.toLowerCase()
  return last === undefined || last === '' ? null : last
}

/**
 * What an export's activity list, given loose, says about the loose files of the import. A file is matched by
 * its name alone: the list names it with the folder it had in the export, which a loose file has lost.
 */
export class Companion {
  private readonly byName: Map<string, ListedActivity>
  private readonly seen = new Set<string>()

  constructor(byName: Map<string, ListedActivity>) {
    this.byName = byName
  }

  /** How many files the list names. */
  get named(): number {
    return this.byName.size
  }

  /** How many of those the import was given. */
  get received(): number {
    return this.seen.size
  }

  /** What the list says about a loose file, noting that the file was given. */
  lookup(fileName: string): ListedActivity | undefined {
    this.note(fileName)
    const key = nameKey(fileName)
    return key === null ? undefined : this.byName.get(key)
  }

  /**
   * Notes that a file the list names was given, as part of a zip as well as loose: a zip beside the list is in the
   * import too, though the zip's own list, not this one, says what its files are.
   */
  note(fileName: string): void {
    const key = nameKey(fileName)
    if (key !== null && this.byName.has(key)) this.seen.add(key)
  }
}

/**
 * Takes the loose activities.csv out of an import's sources: it is neither an activity nor refused. The lists are
 * read before any activity file, and merged (the first row for a name wins). A list that is too large or
 * malformed names nothing, and the files are read without it, as they were. Never throws.
 */
export async function takeCompanion(
  sources: readonly RangedSource[],
): Promise<{ rest: RangedSource[]; companion: Companion | null }> {
  const rest = sources.filter((source) => !isCompanion(source.name))
  if (rest.length === sources.length) return { rest, companion: null }
  const byName = new Map<string, ListedActivity>()
  for (const source of sources) {
    if (!isCompanion(source.name) || source.size > MAX_ACTIVITY_LIST_BYTES) continue
    try {
      const text = new TextDecoder().decode(await readRange(source, 0, source.size))
      for (const [path, listed] of parseActivityList(text)?.files ?? []) {
        const key = nameKey(path)
        if (key !== null && !byName.has(key)) byName.set(key, listed)
      }
    } catch {
      // A list that cannot be read names nothing.
    }
  }
  return { rest, companion: new Companion(byName) }
}
