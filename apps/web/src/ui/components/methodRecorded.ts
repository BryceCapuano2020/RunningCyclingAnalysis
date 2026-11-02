import type { MethodEntry } from './methodEntryTypes'

/** What a file records, how it is read and what it cannot hold: the states after the calculated ones. */
export const RECORDED_ENTRIES: readonly MethodEntry[] = [
  {
    name: 'Sport, start time, distance, speed and route',
    state: 'read',
    lines: [
      'Sport is the file’s activity type.',
      'Distance is the device’s, or else comes from the recorded GPS positions with bad fixes dropped.',
      'A file that records speed uses that speed.',
      'Otherwise, speed comes from distance, or from the GPS track.',
    ],
    detail: [
      'A TCX file with device distance but no speed derives speed from that distance.',
      'It is the change in distance over the 10 s either side of each point (a centred difference).',
      'GPX files never carry device speed, and neither does a TCX file with only positions.',
      'Their speed comes from the GPS track.',
      'That uses a 20 s window centred on each point.',
      'It rejects fixes that imply more than twice the sport’s maximum speed.',
      'It credits no distance across a gap longer than 30 s.',
      'Speeds below 0.5 m/s count as still.',
      'Short best efforts under about 30 s from GPS-only files are less reliable than from a device.',
    ],
  },
  {
    name: 'Heart rate',
    state: 'read',
    lines: ['Each reading is your sensor’s.', 'Heat, altitude and fatigue shift heart rate.'],
  },
  {
    name: 'Power from a power meter',
    state: 'read',
    lines: ['Watts from a meter are the meter’s own readings.'],
  },
  {
    name: 'Timelines and laps',
    state: 'read',
    lines: [
      'Speed, heart rate, power, cadence, altitude and temperature as recorded.',
      'Also the laps your device marked.',
    ],
  },
  {
    name: 'Data checks',
    state: 'read',
    lines: [
      'Sensor dropouts and implausible readings are left out automatically, never corrected.',
      'Each activity lists its problems with the time they occurred.',
      'A heart rate that cannot be right for the effort is left out of the heart-rate checks.',
      'The watts and pace still count.',
    ],
  },
  {
    name: 'Treadmill and indoor data',
    state: 'read',
    lines: [
      'Treadmill and indoor data have no gradient, so they are treated as flat.',
      'Indoor pace is never used for bests, thresholds or predictions.',
      'Its time, distance and heart rate still count.',
    ],
  },
  {
    name: 'Readiness and recovery scores',
    state: 'unavailable',
    lines: [
      'They are built from sleep, heart-rate variability and resting heart rate.',
      'An activity file does not carry those.',
    ],
  },
  {
    name: 'Vendor tests such as 4DP',
    state: 'unavailable',
    lines: [
      'They come from the vendor’s own test and model.',
      'So they cannot be worked out from an activity file.',
    ],
  },
  {
    name: 'Lab measures such as lactate',
    state: 'unavailable',
    lines: ['They need a blood sample or a gas analyser.', 'No activity file records either.'],
  },
]
