import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import { sameAnalysisSettings, sameCountedRuns } from '@rca/core/athlete'
import type { AthleteSettings } from '@rca/core/types'
import type { WorkerRequest } from '../../worker/protocol'

/**
 * The analysis is redone when a mass changes, dated ones included, when what the heart-rate reference reads changes
 * (the year of birth and an entered maximum heart rate), or when the runs counted at walking pace change. Other dated
 * settings only ride along on later requests, since no analysis depends on them.
 */
export function useSettingsSync(
  settings: AthleteSettings,
  settingsRef: MutableRefObject<AthleteSettings>,
  send: (request: WorkerRequest) => void,
) {
  useEffect(() => {
    const changed =
      !sameAnalysisSettings(settingsRef.current, settings) ||
      !sameCountedRuns(settingsRef.current, settings)
    settingsRef.current = settings
    if (changed) send({ type: 'setSettings', settings })
  }, [settings, settingsRef, send])
}
