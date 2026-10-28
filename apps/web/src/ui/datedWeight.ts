import { currentMass, localDateOf } from '@rca/core/athlete'
import type { Measurement } from '@rca/core/athlete'
import { messageOf } from '../api/messageOf'
import { ExplainedError } from './profilePatch'
import type { ProfilePatch } from './profilePatch'
import type { MeasurementsController } from './useMeasurements'

export interface DatedWeightInput {
  measurements: Pick<MeasurementsController, 'entries' | 'whenReady' | 'add' | 'remove'>
  /** The day it is, as an instant. */
  now: number
  /** The weight the saved profile holds, or null. */
  profileKg: number | null
  /** Stores a change to the athlete, signed in or out. Rejects when it is refused. */
  saveAnswers: (next: ProfilePatch) => Promise<void>
}

/**
 * The saves that keep the profile weight and the dated weights one answer. The weight today is the dated
 * weight in effect today, so setting the weight once weights are dated adds one from today, and a change
 * to the dated weights brings the profile's weight with it. When one half is kept and the other refused,
 * the error says which was kept.
 */
export function datedWeightActions({
  measurements,
  now,
  profileKg,
  saveAnswers,
}: DatedWeightInput) {
  /**
   * Saves a change to the athlete. A weight in it waits for the account's dated settings, since without
   * them it could not tell whether to date the weight, and is not saved if they cannot be loaded.
   */
  const saveProfile = async (next: ProfilePatch) => {
    const kg = next.settings?.massKg
    const entries =
      typeof kg === 'number'
        ? await measurements.whenReady().catch((failure: unknown) => {
            throw new ExplainedError(messageOf(failure))
          })
        : measurements.entries
    await saveAnswers(next)
    const dated = entries.some((entry) => entry.kind === 'massKg')
    if (typeof kg !== 'number' || !dated || currentMass(entries, now) === kg) return
    try {
      await measurements.add({ kind: 'massKg', value: kg, from: localDateOf(now) })
    } catch (failure) {
      throw new ExplainedError(
        `Saved as your profile weight, but not as a dated weight, so results still use the weight dated before. ${messageOf(failure)}`,
      )
    }
  }

  const followDatedWeight = async (entries: Measurement[]) => {
    const kg = currentMass(entries, now)
    if (kg === null || kg === profileKg) return
    try {
      await saveAnswers({ settings: { massKg: kg } })
    } catch (failure) {
      throw new ExplainedError(
        `Your dated settings were saved, but your profile weight was not updated to match. ${messageOf(failure)}`,
      )
    }
  }

  return {
    saveProfile,
    addSetting: async (entry: Measurement) => followDatedWeight(await measurements.add(entry)),
    removeSetting: async (entry: Measurement) =>
      followDatedWeight(await measurements.remove(entry)),
  }
}
