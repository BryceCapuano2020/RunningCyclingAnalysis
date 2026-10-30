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
    name: 'Thresholds and their fit spread',
    state: 'calculated',
    line: `Critical speed for a run and critical power for a ride, fitted to your best ${THRESHOLD_EFFORTS} efforts, with the spread of the fit, which is not a range your threshold lies in.`,
  },
  {
    name: 'Best efforts and curves',
    state: 'calculated',
    line: 'The best pace or power you held for each length of time, taken from every activity in the period.',
  },
  {
    name: 'Best efforts over time',
    state: 'calculated',
    line: 'The efforts that were the best of their stretch, each on the day it was done, so you see when your bests were set.',
  },
  {
    name: 'Whether a change is a change',
    state: 'calculated',
    line: 'A move between two periods is called a change only when it is bigger than your own efforts would put between them by chance.',
  },
  {
    name: 'Race predictions',
    state: 'calculated',
    line: 'Times for the usual road races, from your best runs, heart-rate VO2max and weekly running distance, with a spread assumed from typical prediction error.',
  },
  {
    name: 'Output at the same heart rate',
    state: 'calculated',
    line: 'Your pace or power at one heart rate, week by week, from blocks of steady effort. The weekly dots claim no change.',
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
    line: 'Run splits by kilometre or mile, with flat pace, from the recorded distance and moving time. Laps the device recorded are offered as a second view.',
  },
  {
    name: 'Moving time and climb',
    state: 'calculated',
    line: 'Moving time leaves out pauses and gaps in the recording. Climb adds up the recorded altitude and ignores small barometer noise.',
  },
  {
    name: 'The timeline in detail',
    state: 'calculated',
    line: 'In detail shows your measures on one time axis, smoothed to what you are viewing, and summarises any stretch you select.',
  },
  {
    name: 'Time in zones',
    state: 'calculated',
    line: 'How long you spent in each training zone over a period, or a stretch you select, from heart rate, power meter and run pace, by each day’s zones.',
  },
  {
    name: 'Late in long sessions',
    state: 'calculated',
    line: 'Your best 5 and 20 minute output after the first hour or two of a session, and how output per heart rate drifts across a steady effort of an hour or more.',
  },
  {
    name: 'How your reps held up',
    state: 'calculated',
    line: 'For intervals with a slower or shorter recovery between laps of one length, how each rep moved from the first to the last.',
  },
  {
    name: 'Weekly hours by sport',
    state: 'calculated',
    line: 'Moving time each week for each sport, under the Balance trend, so you see how the hours were shared.',
  },
  {
    name: 'Runs at walking pace',
    state: 'calculated',
    line: 'A run slower than 15:00 a mile with no runner’s cadence or jogging is marked as walking pace and left out of your run analysis.',
  },
  {
    name: 'Dated settings and estimated zones',
    state: 'calculated',
    line: 'Weight, max heart rate and threshold apply from their dates. With none entered they are estimated from your activities, and zones are cut from them.',
  },
  {
    name: 'Equivalence across sports',
    state: 'calculated',
    line: 'A ride’s power is converted to the running pace that costs the same energy, with your heart rate used to check that conversion in both sports, so the two share one unit.',
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
    name: 'Timelines and laps',
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
