import { useMemo } from 'react'
import type { Measurement } from '@rca/core/athlete'
import type { AthleteSettings } from '@rca/core/types'
import { analysisSettings, type WeightSettings } from './athlete'

/**
 * The settings the analysis runs on, memoised on what it reads: the two masses, the dated settings and the
 * runs at walking pace the athlete counts.
 * An equal settings object built anew on a later render gives the same one, so the share preview is not
 * redrawn. The dated settings and counted runs lists must themselves be stable between renders (see useMeasurements).
 */
export function useAnalysisSettings(
  settings: WeightSettings,
  measurements: readonly Measurement[],
  countedRuns: readonly string[],
): AthleteSettings {
  const { massKg, bikeMassKg } = settings
  return useMemo(
    () => analysisSettings({ massKg, bikeMassKg }, measurements, countedRuns),
    [massKg, bikeMassKg, measurements, countedRuns],
  )
}
