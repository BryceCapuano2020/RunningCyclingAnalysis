import type { MethodEntry } from './methodEntryTypes'

/** The entries about one activity, or the settings behind the zones, calculated by the app. */
export const ACTIVITY_ENTRIES: readonly MethodEntry[] = [
  {
    name: 'Dated settings and zones',
    state: 'calculated',
    lines: [
      'Each activity uses the weight, max heart rate and threshold dated on Profile on or before its day.',
      'Undated, they come from your current weight and your activities.',
      'Zones follow Coggan’s power levels, five heart-rate zones of your max and Friel’s pace zones.',
    ],
  },
  {
    name: 'Runs at walking pace',
    state: 'calculated',
    lines: [
      'A run slower than 15:00 a mile with no runner’s cadence or jogging counts as walking, and is left out.',
    ],
  },
]
