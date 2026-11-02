import { CP_FIT_MAX_S, CP_FIT_MIN_S } from '@rca/core/constants'
import { HEADLINE_LABEL } from '../grades'
import { effortLabel } from '../records'

/** Where a number the app shows comes from. */
export type CalculationState = 'calculated' | 'read' | 'unavailable'

/** The heading of each state, and the lines under it that say what the state means. */
export const STATE_COPY: Record<CalculationState, { title: string; lines: readonly string[] }> = {
  calculated: {
    title: 'Calculated by this app',
    lines: [
      'Worked out from your files.',
      'Your year of birth, sex and weight are used where a figure needs them.',
    ],
  },
  read: { title: 'Recorded in your files', lines: ['Taken as your files recorded them.'] },
  unavailable: {
    title: 'Not available from activity files',
    lines: ['These need inputs an activity file does not hold.'],
  },
}

/** The states in the order the page lists them. */
export const STATE_ORDER: readonly CalculationState[] = ['calculated', 'read', 'unavailable']

/** One thing the app shows, or cannot show: its name, where it comes from, and its plain lines. */
export interface CalculationItem {
  name: string
  state: CalculationState
  lines: readonly string[]
}

/** The shortest and longest efforts a threshold is fitted to, as copy: "3 to 20 min". */
const THRESHOLD_EFFORTS = `${CP_FIT_MIN_S / 60} to ${effortLabel(CP_FIT_MAX_S)}`

/** Every feature the app has today, each in one state, in the order the page lists them. */
export const CALCULATION_ITEMS: readonly CalculationItem[] = [
  {
    name: 'Balance and levels',
    state: 'calculated',
    lines: [
      `Each sport’s best ${HEADLINE_LABEL} is graded for your age and sex on published standards.`,
      'The two grades give the balance.',
      'Rides are graded through a running equivalent.',
    ],
  },
  {
    name: 'Thresholds and their range',
    state: 'calculated',
    lines: [
      `Critical speed for a run and critical power for a ride, fitted to your best ${THRESHOLD_EFFORTS} efforts.`,
      'Its range is the fit’s own range.',
      'It is not the balance’s 90% range.',
    ],
  },
  {
    name: 'Best efforts and curves',
    state: 'calculated',
    lines: [
      'The best pace or power you held for each length of time, from every activity in the period.',
    ],
  },
  {
    name: 'Best efforts over time',
    state: 'calculated',
    lines: [
      'The best of each stretch, on the day it was done.',
      'It shows when each best was set.',
    ],
  },
  {
    name: 'Whether a change is a change',
    state: 'calculated',
    lines: ['A move between two periods is called a change only when it is bigger than chance.'],
  },
  {
    name: 'Race predictions',
    state: 'calculated',
    lines: [
      'Times for the usual road races, from your best runs, heart-rate VO2max and weekly running distance.',
      'Each has a range from typical prediction error.',
    ],
  },
  {
    name: 'Pace at heart rate',
    state: 'calculated',
    lines: [
      'Your pace, or power for rides, at one heart rate, week by week, from blocks of steady effort.',
      'The weekly dots claim no change.',
    ],
  },
  {
    name: 'History',
    state: 'calculated',
    lines: [
      'Your pace or power at one heart rate across the years, cut into plateaus.',
      'Each slip, return and rise is listed when the runs show it.',
    ],
  },
  {
    name: 'Level target',
    state: 'calculated',
    lines: [
      'What the lower sport’s best effort would need to be to match the other.',
      'It is in that sport’s own unit.',
    ],
  },
  {
    name: 'Grade by duration',
    state: 'calculated',
    lines: [
      'Your age grade at each effort length.',
      'It shows which lengths each sport grades higher.',
    ],
  },
  {
    name: 'Best durations',
    state: 'calculated',
    lines: [
      'Each best is set against your own curve.',
      'A length that stands out from the rest is named.',
    ],
  },
  {
    name: 'Virtual power',
    state: 'calculated',
    lines: [
      'Estimated watts on steady climbs for rides with no power meter.',
      'They come from speed, gradient and your weight.',
      'They are checked against rides that have a meter.',
    ],
  },
  {
    name: 'Splits',
    state: 'calculated',
    lines: [
      'Run splits by kilometre or mile, with grade-adjusted pace.',
      'They come from the recorded distance and moving time.',
      'Laps the device recorded are offered as a second view.',
    ],
  },
  {
    name: 'Moving time and climb',
    state: 'calculated',
    lines: [
      'Moving time leaves out pauses and gaps in the recording.',
      'Climb adds up the recorded altitude.',
      'It ignores small barometer noise.',
    ],
  },
  {
    name: 'The timeline in detail',
    state: 'calculated',
    lines: [
      'The detail view shows your measures on one time axis, smoothed to what you are viewing.',
      'It summarises any stretch you select.',
    ],
  },
  {
    name: 'Time in zones',
    state: 'calculated',
    lines: [
      'How long you spent in each training zone over a period, or a stretch you select.',
      'It uses heart rate, power meter and run pace, by each day’s zones.',
    ],
  },
  {
    name: 'Durability',
    state: 'calculated',
    lines: [
      'Your best 5 and 20 minute output after the first hour or two of a session.',
      'It also shows how efficiency drifts across a steady effort of an hour or more.',
    ],
  },
  {
    name: 'How your reps held up',
    state: 'calculated',
    lines: [
      'For intervals with a slower or shorter recovery between laps of one length, how each rep moved from the first to the last.',
    ],
  },
  {
    name: 'Weekly hours by sport',
    state: 'calculated',
    lines: [
      'Moving time each week for each sport, under the Balance trend.',
      'It shows how the hours were shared.',
    ],
  },
  {
    name: 'Runs at walking pace',
    state: 'calculated',
    lines: [
      'A run slower than 15:00 a mile with no runner’s cadence or jogging is marked as walking pace.',
      'It is left out of your run analysis.',
    ],
  },
  {
    name: 'Dated settings and estimated zones',
    state: 'calculated',
    lines: [
      'Weight, max heart rate and threshold apply from their dates.',
      'With none entered, they are estimated from your activities.',
      'Zones are cut from them.',
    ],
  },
  {
    name: 'Equivalence across sports',
    state: 'calculated',
    lines: [
      'A ride’s power is converted to the running pace that costs the same energy.',
      'Your heart rate checks that conversion in both sports.',
      'So the two share one unit.',
    ],
  },
  {
    name: 'Heart-rate set-aside',
    state: 'calculated',
    lines: [
      'A heart rate that cannot be right for the effort is left out of the heart-rate checks.',
      'The watts and pace still count.',
    ],
  },
  {
    name: 'Sport, start time, distance, speed and route',
    state: 'read',
    lines: [
      'Sport is the file’s activity type.',
      'Distance and speed are the device’s.',
      'Otherwise they come from the recorded GPS positions with bad fixes dropped.',
    ],
  },
  {
    name: 'Heart rate',
    state: 'read',
    lines: [
      'Each reading is your sensor’s.',
      'Dropouts and implausible readings are left out, never corrected.',
    ],
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
