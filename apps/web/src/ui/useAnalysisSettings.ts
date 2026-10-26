import { useMemo } from 'react'
import type { AthleteSettings } from '@rca/core/types'
import { analysisSettings, type WeightSettings } from './athlete'

/**
 * The settings the analysis runs on, memoised on the two values it reads: an equal settings object
 * built anew on a later render gives the same one, so the share preview is not redrawn.
 */
export function useAnalysisSettings(settings: WeightSettings): AthleteSettings {
  const { massKg, bikeMassKg } = settings
  return useMemo(() => analysisSettings({ massKg, bikeMassKg }), [massKg, bikeMassKg])
}
