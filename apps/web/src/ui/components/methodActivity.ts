import type { MethodEntry } from './methodEntryTypes'

/** The entries about one activity, a stretch of a week, or the settings behind the zones, calculated by the app. */
export const ACTIVITY_ENTRIES: readonly MethodEntry[] = [
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
    name: 'Dated settings and zones',
    state: 'calculated',
    lines: [
      'On Profile, date a weight, max heart rate or threshold.',
      'Each activity uses the latest entry on or before its day.',
      'If none is older, it uses the earliest entry.',
      'With no entries, rides use your current weight.',
      'With no entries, thresholds and heart rates are estimated from your activities.',
      'Training zones are cut from those settings by published schemes.',
      'A zone set made from your own activities says so.',
    ],
    detail: [
      'Power uses Coggan’s seven power levels.',
      'Heart rate uses five zones of your max.',
      'Pace uses Friel’s pace zones from threshold pace.',
      'A ride’s W/kg uses the body and bike weight in effect on that ride’s local day.',
      'The watts estimated for a ride without a power meter use them too.',
      'So a ride from last year does not use today’s weight.',
      'With dated weights, the best ride at a duration is the one with the most watts per kilogram on its day.',
      'That one ride supplies its watts, slope and running equivalent.',
      'Your current weight is the dated weight in effect today.',
      'Setting it once weights are dated adds an entry from today.',
      'The saved summary of an activity holds no weight.',
      'So changing a dated weight changes results without reading any file again.',
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
]
