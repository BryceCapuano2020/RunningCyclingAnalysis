import type { ActivityRecord, LabelChange } from '@rca/contract'
import { MAX_LABELS_PER_REQUEST } from '@rca/contract'
import { applyLabels } from '@rca/core/import/applyLabels'
import { hashedFileName } from '@rca/core/import/minimise'
import type { LabelProposal } from '@rca/core/import/applyLabels'
import type { AnalysisSession } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import { listActivities, patchLabels } from '../api/client'
import { noteWork } from './workerWire'

/** What applying the list's labels changed: the proposals the account took, and the library as it now stands. */
export interface AppliedLabels {
  applied: LabelProposal[]
}

/** The proposals in requests of the most the endpoint takes. */
function chunks(proposals: readonly LabelProposal[]): LabelProposal[][] {
  const out: LabelProposal[][] = []
  for (let start = 0; start < proposals.length; start += MAX_LABELS_PER_REQUEST) {
    out.push(proposals.slice(start, start + MAX_LABELS_PER_REQUEST))
  }
  return out
}

/**
 * Sends one request, and the rows it missed once more from what the answer says they hold now, as long as they
 * hold no label: a rebuild moved the revision, nothing the athlete set is overwritten.
 */
async function send(chunk: readonly LabelProposal[], userId: string): Promise<void> {
  const answer = await patchLabels(chunk as LabelChange[], userId)
  const retry = answer.missed.flatMap((row) => {
    const wanted = chunk.find((p) => p.id === row.id)
    return wanted === undefined || row.athleteType !== null
      ? []
      : [{ ...wanted, revision: row.revision }]
  })
  if (retry.length > 0) await patchLabels(retry as LabelChange[], userId)
}

/**
 * Labels the workouts the account holds from the types the import's list gave their files, then reads the library
 * again so the page shows what the account now holds, also when a write failed part way: the requests before it
 * stand, and they are the ones returned, so they can be undone. Nothing else is lost: the next import applies the rest. Returns the proposals the account took, so they can be undone.
 */
export async function applyListLabels(
  records: ReadonlyMap<string, ActivityRecord>,
  listedTypes: ReadonlyMap<string, string>,
  userId: string,
  reload: (records: ActivityRecord[]) => void,
): Promise<LabelProposal[]> {
  // A workout imported from revision 7 holds a hash of its file's name (import/minimise.ts), so the list's names are
  // offered in both forms: as they are, for the workouts saved before, and hashed, for those saved since.
  const names = new Map(listedTypes)
  for (const [file, type] of listedTypes) {
    names.set(hashedFileName(file), type)
  }
  const proposals = applyLabels(
    [...records.values()].map(({ id, digest }) => ({ id, digest })),
    names,
  )
  if (proposals.length === 0) return []
  try {
    for (const chunk of chunks(proposals)) {
      noteWork()
      await send(chunk, userId)
    }
  } catch {
    // A write that fails part way leaves the requests before it applied: they are read back below.
  }
  try {
    const fresh = await listActivities(undefined, userId, undefined, undefined, noteWork)
    reload(fresh)
    const byId = new Map(fresh.map((record) => [record.id, record]))
    return proposals.filter((p) => byId.get(p.id)?.digest.athleteType === p.athleteType)
  } catch {
    // The account cannot be read: nothing is known to be applied, and the next import tries again.
    return []
  }
}

/** Puts the session on the library as the account now holds it. */
export function reloadSession(
  session: AnalysisSession,
  settings: AthleteSettings,
  records: readonly ActivityRecord[],
) {
  return session.loadDigests(
    records.map((record) => record.digest),
    settings,
    { keepUnsaved: true },
  )
}
