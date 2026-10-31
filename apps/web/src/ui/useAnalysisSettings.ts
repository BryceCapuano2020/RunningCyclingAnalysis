import { useMemo } from 'react'
import type { Measurement } from '@rca/core/athlete'
import type { AthleteSettings } from '@rca/core/types'
import { analysisSettings, type WeightSettings } from './athlete'

const NO_KEPT: readonly string[] = []

/**
 * The settings the analysis runs on, memoised on what it reads: the two masses, the dated settings, the year of birth (which
 * the effort gate reads to judge the heart-rate reference against the age band), the runs at walking pace the athlete counts
 * and the rides whose implausible power the athlete kept.
 * An equal settings object built anew on a later render gives the same one, so the share preview is not
 * redrawn. The dated settings, counted runs and kept rides lists must themselves be stable between renders (see
 * useMeasurements, useKeptPower).
 */
export function useAnalysisSettings(
  settings: WeightSettings,
  measurements: readonly Measurement[],
  birthYear: number | null,
  countedRuns: readonly string[],
  keepPower: readonly string[] = NO_KEPT,
): AthleteSettings {
  const { massKg, bikeMassKg } = settings
  return useMemo(
    () => analysisSettings({ massKg, bikeMassKg }, measurements, birthYear, countedRuns, keepPower),
    [massKg, bikeMassKg, measurements, birthYear, countedRuns, keepPower],
  )
}
