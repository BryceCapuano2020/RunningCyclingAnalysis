import { fileNameOf } from '../duplicates'
import type { ActivityDigest, AthleteType } from '../types'
import { entryKey } from './activitiesCsv'
import { athleteTypeOf } from './athleteType'
import { hashedFileName } from './minimise'

/** One label to set on a saved activity: the record, the revision the digest was read at, and the label. */
export interface LabelProposal {
  id: string
  revision: number
  from: AthleteType | null
  athleteType: AthleteType | null
}

/** A saved activity: the id its record has, and its digest, at whatever model revision it was made. */
export interface HeldActivity {
  id: string
  digest: ActivityDigest
}

/**
 * The labels an import's list gives the workouts a library already holds (D12 section 2.4). A held digest, at any
 * revision, whose file the list names with a type in the table and that has no label yet gets one; the athlete's
 * own label is never replaced, and a name not in the table, a run, a ride or a file the list does not name gives
 * nothing. No re-digest and no revision change: the proposal is sent as it is. A workout imported since revision 7 holds a
 * hash of its file's name (import/minimise.ts), so the list's names are matched in both forms: as they are, for the
 * workouts saved before, and hashed, for those saved since.
 */
export function applyLabels(
  held: Iterable<HeldActivity>,
  listedTypes: ReadonlyMap<string, string>,
): LabelProposal[] {
  const byFile = new Map<string, AthleteType>()
  for (const [file, type] of listedTypes) {
    const label = athleteTypeOf(type)
    if (label === undefined) continue
    for (const name of [file, hashedFileName(file.replace(/\.gz$/i, ''))]) {
      const key = entryKey(name)
      if (key !== null && !byFile.has(key)) byFile.set(key, label)
    }
  }
  if (byFile.size === 0) return []
  const proposals: LabelProposal[] = []
  for (const { id, digest } of held) {
    if (digest.athleteType !== undefined) continue
    const key = entryKey(fileNameOf(digest.id))
    const label = key === null ? undefined : byFile.get(key)
    if (label !== undefined) {
      proposals.push({ id, revision: digest.modelRevision, from: null, athleteType: label })
    }
  }
  return proposals
}

/** The proposals that put back what applying these changed: each label taken off again. */
export function undoLabels(applied: readonly LabelProposal[]): LabelProposal[] {
  return applied.map(({ id, revision, from, athleteType }) => ({
    id,
    revision,
    from: athleteType,
    athleteType: from,
  }))
}
