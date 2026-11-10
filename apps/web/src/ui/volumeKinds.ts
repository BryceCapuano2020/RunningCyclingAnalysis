import type { Sport } from '@rca/core/types'
import { SPORT_ACTIVITY, SPORT_LABEL, SPORT_ORDER, SPORT_PLURAL } from './sports'

/**
 * What the activity volume adds up: each sport, then lifting. Lifting is not a core Sport, so it joins the
 * list here, where only time and a count of sessions are summed.
 */
export const VOLUME_KINDS = [...SPORT_ORDER, 'lift'] as const

export type VolumeKind = Sport | 'lift'

/** The kind as a legend entry. A key whose time in view includes an estimate adds ", estimated". */
export const VOLUME_LABEL: Record<VolumeKind, string> = { ...SPORT_LABEL, lift: 'Lift' }

/**
 * Whether a kind has no distance, so a month heading gives its time instead: lifting. Its time is measured from the
 * live stamps of a day's sets or estimated from them (core `liftSessionsOf`); an estimate, and a total that includes
 * one, is written with "~".
 */
export const VOLUME_TIME_ONLY: Record<VolumeKind, boolean> = { run: false, ride: false, lift: true }

/** One of the kind as the noun in a count: "1 run", "1 lift". */
export const VOLUME_NOUN: Record<VolumeKind, string> = { ...SPORT_ACTIVITY, lift: 'lift' }

export const VOLUME_PLURAL: Record<VolumeKind, string> = { ...SPORT_PLURAL, lift: 'lifts' }

/** A day with lifting, as the volume reads it: its local day number, its seconds and whether they were measured. */
export interface LiftDay {
  day: number
  seconds: number
  /** False when the seconds are estimated from the sets. */
  measured: boolean
}

export const NO_LIFT_DAYS: readonly LiftDay[] = []
