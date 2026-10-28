import { CP_FIT_MAX_S, CP_FIT_MIN_S } from '@rca/core/constants'
import { HEADLINE_LABEL } from '../grades'
import { effortLabel } from '../records'

/** Where a number the app shows comes from. */
export type CalculationState = 'calculated' | 'read' | 'unavailable'

/** The heading of each state, and the one line under it that says what the state means. */
export const STATE_COPY: Record<CalculationState, { title: string; line: string }> = {
  calculated: {
    title: 'Calculated by this app',
    line: 'Worked out from your files, and from your year of birth, sex and weight where a figure uses them.',
  },
  read: { title: 'Read from your files', line: 'Taken from what your files recorded.' },
  unavailable: {
    title: 'Not available from activity files',
    line: 'These need inputs an activity file does not hold.',
  },
}

/** The states in the order the page lists them. */
export const STATE_ORDER: readonly CalculationState[] = ['calculated', 'read', 'unavailable']

/** One thing the app shows, or cannot show: its name, where it comes from, and one plain line. */
export interface CalculationItem {
  name: string
  state: CalculationState
  line: string
}

/** The shortest and longest efforts a threshold is fitted to, as copy: "3 to 20 min". */
const THRESHOLD_EFFORTS = `${CP_FIT_MIN_S / 60} to ${effortLabel(CP_FIT_MAX_S)}`

/** Every feature the app has today, each in one state, in the order the page lists them. */
export const CALCULATION_ITEMS: readonly CalculationItem[] = [
  {
    name: 'Balance and levels',
    state: 'calculated',
    line: `Each sport’s best ${HEADLINE_LABEL} is graded for your age and sex on published standards, and the two grades give the balance. Rides are graded through a running equivalent.`,
  },
  {
    name: 'Thresholds and their ranges',
    state: 'calculated',
    line: `Critical speed for a run and critical power for a ride, fitted to your best ${THRESHOLD_EFFORTS} efforts, with a likely range from the fit.`,
  },
  {
    name: 'Best efforts and curves',
    state: 'calculated',
    line: 'The best pace or power you held for each length of time, taken from every activity in the period.',
  },
  {
    name: 'Race predictions',
    state: 'calculated',
    line: 'Times for the usual road races, up to the marathon, carried from your best runs, your heart-rate VO2max and your weekly running distance, with a likely range.',
  },
  {
    name: 'Output at the same heart rate',
    state: 'calculated',
    line: 'Your pace or power at one heart rate, week by week, from blocks of steady effort.',
  },
  {
    name: 'Level target',
    state: 'calculated',
    line: 'What the lower sport’s best effort would need to be to grade level with the other, in that sport’s own unit.',
  },
  {
    name: 'Grade by duration',
    state: 'calculated',
    line: 'Your age grade at each effort length, so you see which lengths each sport grades higher.',
  },
  {
    name: 'Where your bests stand out',
    state: 'calculated',
    line: 'Each best set against your own curve, so a length that stands out from the rest is named.',
  },
  {
    name: 'Virtual power',
    state: 'calculated',
    line: 'Estimated watts on climbs for rides with no power meter, from speed, gradient and your weight, checked against your rides that have one.',
  },
  {
    name: 'Splits',
    state: 'calculated',
    line: 'Run splits by kilometre or mile, with flat pace, worked out from the recorded distance and time.',
  },
  {
    name: 'Moving time and climb',
    state: 'calculated',
    line: 'Moving time leaves out pauses and gaps in the recording. Climb adds up the recorded altitude and ignores small barometer noise.',
  },
  {
    name: 'Time at each pace, power or heart rate',
    state: 'calculated',
    line: 'In detail shows how long you spent in each band, summarises any stretch you select, and suggests intervals when the device marked no laps.',
  },
  {
    name: 'Time in zones',
    state: 'calculated',
    line: 'How long you spent in each training zone over a period, or a stretch you select, from heart rate, power meter and run pace, by each day’s zones.',
  },
  {
    name: 'Heart-rate set-aside',
    state: 'calculated',
    line: 'A heart rate that cannot be right for the effort is left out of the heart-rate checks. The watts and pace still count.',
  },
  {
    name: 'Sport, start time, distance, speed and route',
    state: 'read',
    line: 'Sport is the file’s activity type. Distance and speed are the device’s, or come from the recorded GPS positions with bad fixes dropped.',
  },
  {
    name: 'Heart rate',
    state: 'read',
    line: 'Each reading is your sensor’s. Dropouts and implausible readings are left out, not corrected.',
  },
  {
    name: 'Power from a power meter',
    state: 'read',
    line: 'Watts from a meter are the meter’s own readings.',
  },
  {
    name: 'Timelines and laps in In detail',
    state: 'read',
    line: 'Speed, heart rate, power, cadence, altitude and temperature as recorded, and the laps your device marked.',
  },
  {
    name: 'Readiness and recovery scores',
    state: 'unavailable',
    line: 'They are built from sleep, heart-rate variability and resting heart rate, which an activity file does not carry.',
  },
  {
    name: 'Vendor tests such as 4DP',
    state: 'unavailable',
    line: 'They come from the vendor’s own test and model, so they cannot be worked out from an activity file.',
  },
  {
    name: 'Lab measures such as lactate',
    state: 'unavailable',
    line: 'They need a blood sample or a gas analyser, and no activity file records either.',
  },
]
