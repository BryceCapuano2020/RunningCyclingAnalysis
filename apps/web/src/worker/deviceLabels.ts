import { applyLabels, undoLabels } from '@rca/core/import/applyLabels'
import type { LabelProposal } from '@rca/core/import/applyLabels'
import type { AnalysisSession, SessionState } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import type { DeviceActions } from './device'
import type { DeviceLibrary } from './deviceLibrary'

/** The labels an import's list put on the workouts kept in this browser, written through the device library. */
export interface DeviceLabelling {
  /** The proposals the library took, and the session on the library as it now stands (null when it could not be read). */
  labelled: LabelProposal[]
  state: SessionState | null
}

/**
 * Labels (D12 section 2.4) and takes labels off the workouts a signed-out visitor keeps in this browser. Each row is
 * changed in its own transaction, only while it holds the digest and the label the proposal read and the library is
 * still the one this session loaded, so a workout replaced since, or labelled otherwise by the athlete, is left as it
 * is. Nothing here leaves the browser. A write that fails stops the rest: those before it stand, and are returned.
 */
export function deviceLabels(
  session: AnalysisSession,
  library: DeviceLibrary,
  device: Pick<DeviceActions, 'epochNow' | 'report'>,
) {
  async function write(
    proposals: readonly LabelProposal[],
    ids: ReadonlyMap<string, string>,
    settings: AthleteSettings,
  ): Promise<DeviceLabelling> {
    const labelled: LabelProposal[] = []
    const epoch = device.epochNow() ?? undefined
    try {
      for (const p of proposals) {
        const digestId = ids.get(p.id)
        if (digestId === undefined) continue
        const change = { from: p.from, athleteType: p.athleteType }
        if (await library.setLabel(p.id, digestId, change, epoch)) labelled.push(p)
      }
    } catch {
      // The library was emptied, or storage refused: what was written before stands.
    }
    await device.report()
    try {
      const entries = await library.all()
      const state = session.loadDigests(
        entries.map((entry) => entry.digest),
        settings,
        { keepUnsaved: true },
      )
      return { labelled, state }
    } catch {
      return { labelled, state: null }
    }
  }

  /** The digest each kept workout holds now, by its workout key. */
  async function heldDigestIds(): Promise<Map<string, string>> {
    const entries = await library.all().catch(() => [])
    return new Map(entries.map(({ workoutKey, digest }) => [workoutKey, digest.id]))
  }

  return {
    /** Labels the kept workouts the export's list gives a type in the table, and none that already hold a label. */
    async apply(
      listedTypes: ReadonlyMap<string, string>,
      settings: AthleteSettings,
    ): Promise<DeviceLabelling> {
      const entries = await library.all().catch(() => [])
      const proposals = applyLabels(
        entries.map(({ workoutKey, digest }) => ({ id: workoutKey, digest })),
        listedTypes,
      )
      if (proposals.length === 0) return { labelled: [], state: null }
      const ids = new Map(entries.map(({ workoutKey, digest }) => [workoutKey, digest.id]))
      return write(proposals, ids, settings)
    },
    /**
     * Puts back what `apply` labelled. The label to take off is checked against the label the row holds, so one the
     * athlete has set otherwise since is left as it is.
     */
    async undo(
      applied: readonly LabelProposal[],
      settings: AthleteSettings,
    ): Promise<DeviceLabelling> {
      if (applied.length === 0) return { labelled: [], state: null }
      return write(undoLabels(applied), await heldDigestIds(), settings)
    },
  }
}
