import type { MethodEntry } from './methodEntryTypes'

/** What a file records, how it is read and what it cannot hold: the states after the calculated ones. */
export const RECORDED_ENTRIES: readonly MethodEntry[] = [
  {
    name: 'What files record',
    state: 'read',
    lines: [
      'Sport, heart rate, power, cadence and laps are as your devices recorded them.',
      'Distance and speed are the device’s, or else from GPS with bad fixes dropped.',
    ],
  },
  {
    name: 'Data checks',
    state: 'read',
    lines: [
      'Dropouts and implausible readings are left out, never corrected.',
      'A heart rate that cannot fit the effort is left out of the heart-rate checks only.',
    ],
  },
  {
    name: 'Treadmill and indoor data',
    state: 'read',
    lines: ['Treated as flat, and indoor pace is never used for bests, thresholds or predictions.'],
  },
  {
    name: 'Readiness, vendor tests and lab measures',
    state: 'unavailable',
    lines: [
      'They need sleep and heart-rate variability, a vendor’s own test, or a blood or gas sample.',
    ],
  },
]
