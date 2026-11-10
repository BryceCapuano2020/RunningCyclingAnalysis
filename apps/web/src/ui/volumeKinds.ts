import type { Sport } from '@rca/core/types'
import { SPORT_ACTIVITY, SPORT_LABEL, SPORT_ORDER, SPORT_PLURAL } from './sports'

/**
 * What the activity volume adds up: each sport, then lifting. Lifting is not a core Sport, so it joins the
 * list here, where only time and a count of sessions are summed.
 */
export const VOLUME_KINDS = [...SPORT_ORDER, 'lift'] as const

export type VolumeKind = Sport | 'lift'

/** The kind as a legend entry. */
export const VOLUME_LABEL: Record<VolumeKind, string> = { ...SPORT_LABEL, lift: 'Lift' }

/** One of the kind as the noun in a count: "1 run", "1 lift". */
export const VOLUME_NOUN: Record<VolumeKind, string> = { ...SPORT_ACTIVITY, lift: 'lift' }

export const VOLUME_PLURAL: Record<VolumeKind, string> = { ...SPORT_PLURAL, lift: 'lifts' }

/** A day with lifting, as the volume reads it: its local day number and the estimated seconds. */
export interface LiftDay {
  day: number
  seconds: number
}

export const NO_LIFT_DAYS: readonly LiftDay[] = []
