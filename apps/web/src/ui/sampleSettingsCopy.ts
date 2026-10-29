import { analysisSettings } from './athlete'
import { SAMPLE_SETTINGS } from './sampleAthlete'

/** What the sample's zones are cut for: its two masses, and none of the visitor's own settings. */
export const SAMPLE_ZONE_ATHLETE = analysisSettings(SAMPLE_SETTINGS)

/** Said above the sample's settings, so they are not taken for the visitor's own. */
export const SAMPLE_SETTINGS_NOTE =
  "These are the sample athlete's settings. Add your files to use your own."
