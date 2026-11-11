import type { takeCompanion } from './import/looseList'
import type { ImportCompletion } from './sessionHooks'
import { sortRead } from './sessionSource'
import type { ReadFile } from './sessionSource'
import type { SaveBatch } from './sessionSync'
import type { ActivityDigest } from './types'

/** What an import has gathered by the time its files are read and its saves have settled. */
export interface ImportParts {
  outcome: Pick<ImportCompletion, 'activities' | 'rejected' | 'notActivities'>
  read: readonly ReadFile[]
  batch: SaveBatch
  /** The library's analysable digests, and those of them the analysis hides as copies of a better one. */
  analysable: readonly ActivityDigest[]
  hidden: ReadonlySet<ActivityDigest>
  listedTypes: ReadonlyMap<string, string>
  skippedTypes: Record<string, number>
  companion: Awaited<ReturnType<typeof takeCompanion>>['companion']
  needsList: boolean
}

/**
 * What an import reports when it is done. Only visible digests count as added, whatever the order; one that replaced a
 * held-out digest is upgraded, not added.
 */
export function completionOf(parts: ImportParts): ImportCompletion {
  const { outcome, read, batch, analysable, hidden, listedTypes, skippedTypes, companion } = parts
  const visibleNew = [...batch.added].filter(([, digest]) => !hidden.has(digest))
  const added = visibleNew.filter(([key]) => !batch.upgraded.has(key)).map(([, digest]) => digest)
  const upgraded = visibleNew.filter(([key]) => batch.upgraded.has(key)).map(([, digest]) => digest)
  const visible = analysable.filter((digest) => !hidden.has(digest))
  const files = sortRead(read, new Set([...added, ...upgraded]), visible)
  return {
    ...outcome,
    ...files,
    added,
    upgraded,
    ...(listedTypes.size === 0 ? {} : { listedTypes }),
    ...(Object.keys(skippedTypes).length === 0 ? {} : { skippedTypes }),
    ...(companion === null || companion.named === 0
      ? {}
      : { listed: { named: companion.named, received: companion.received } }),
    ...(parts.needsList ? { needsList: true as const } : {}),
  }
}
