import type { Sport } from '../types'
import { formatTimeOfDay } from '../units/format'

/** The longest name kept, in characters (code points). A longer title is cut and ends with an ellipsis. */
export const MAX_TITLE_CHARS = 120

const SPORT_LABEL: Record<Sport, string> = { run: 'Run', ride: 'Ride' }

/**
 * The parts of the day, by the local hour each starts at. A part runs until the next one starts,
 * and Night runs across midnight, so it starts at both ends of the day.
 */
const DAY_PARTS: readonly { fromHour: number; label: string }[] = [
  { fromHour: 0, label: 'Night' },
  { fromHour: 5, label: 'Morning' },
  { fromHour: 11, label: 'Lunch' },
  { fromHour: 14, label: 'Afternoon' },
  { fromHour: 17, label: 'Evening' },
  { fromHour: 21, label: 'Night' },
]

/**
 * The names a device writes by default, which say nothing about the activity: Garmin's track log
 * ("ACTIVE LOG", "ACTIVE LOG #2"), a bare number, a date or time, and a sport word with a date.
 */
const DEVICE_NAME =
  /^(ACTIVE LOG( ?#?\d+)?|\d+|((run|running|ride|riding|bike|biking|cycling|activity) )?\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?( ?(Z|[+-]\d{2}:?\d{2}))?)?)$/i

/** The part of the day an hour (0 to 23, local time) falls in. */
export function dayPart(hour: number): string {
  let label = DAY_PARTS[0]!.label
  for (const part of DAY_PARTS) if (hour >= part.fromHour) label = part.label
  return label
}

/**
 * A name from the start time and sport, such as "Morning Run". The hour is read on the clock of the
 * device that imports the file, and the name is saved with the activity, so it does not change later.
 */
export function generatedName(startMs: number, sport: Sport): string {
  return `${dayPart(new Date(startMs).getHours())} ${SPORT_LABEL[sport]}`
}

/**
 * A title with its whitespace (line breaks too) joined, cut to the maximum by character. Undefined
 * when blank.
 */
export function cleanTitle(text: string | undefined): string | undefined {
  const joined = (text ?? '').replace(/\s+/g, ' ').trim()
  if (joined === '') return undefined
  // A code point takes one or two UTF-16 units, so the first 2 × MAX units hold at least MAX code
  // points. Only that window is split into characters, however long the name is.
  const characters = Array.from(joined.slice(0, 2 * MAX_TITLE_CHARS))
  if (joined.length <= 2 * MAX_TITLE_CHARS && characters.length <= MAX_TITLE_CHARS) return joined
  return `${characters.slice(0, MAX_TITLE_CHARS - 1).join('')}…`
}

/**
 * The title a file carries (a GPX track name), or undefined when it is blank or only a name a device
 * writes by default, which says nothing about the activity.
 */
export function fileTitle(text: string | undefined): string | undefined {
  const title = cleanTitle(text)
  return title === undefined || DEVICE_NAME.test(title) ? undefined : title
}

/** Where an activity sits in its file: its sport and start, and its place among several. */
export interface LegOf {
  sport: Sport
  startMs: number
  /**
   * True when the title is shared by several activities of one file, such as an export's name for
   * a multisport file, so each name carries its sport.
   */
  shared: boolean
  /** The 1-based part when a long gap split the activity. */
  part?: number
}

/**
 * The name of one activity: its title when it has one (with its sport when the title is shared, and
 * its part number when a gap split it), else one from its start time and sport.
 */
export function activityName(title: string | undefined, leg: LegOf): string {
  const clean = cleanTitle(title)
  if (clean === undefined) return generatedName(leg.startMs, leg.sport)
  const sport = leg.shared ? ` (${SPORT_LABEL[leg.sport]})` : ''
  const part = leg.part === undefined ? '' : ` (part ${leg.part})`
  return `${clean}${sport}${part}`
}

/** One leg of a file, with the names it could be given. */
export interface LegNaming {
  /** The name the file's export gives its activity, such as Strava's activities.csv. */
  exportName: string | undefined
  /** The leg's own title in its file, such as a GPX track name. */
  title: string | undefined
  sport: Sport
  startMs: number
  /** True when the file holds several activities. */
  multi: boolean
  /** The 1-based part when a long gap split the activity. */
  part?: number
}

/**
 * The name of one leg. An export's name is used first, unless it is a device default, which falls
 * back to the leg's own title. A shared export name carries the sport when the file holds several
 * activities. Without a title, the name comes from the start time and sport.
 */
export function nameOfLeg(leg: LegNaming): string {
  const exported = fileTitle(leg.exportName)
  if (exported !== undefined) {
    const shared = leg.multi
    return activityName(exported, {
      sport: leg.sport,
      startMs: leg.startMs,
      shared,
      part: leg.part,
    })
  }
  return activityName(leg.title, {
    sport: leg.sport,
    startMs: leg.startMs,
    shared: false,
    part: leg.part,
  })
}

/**
 * Adds the start time to every name that more than one activity of a file shares, so the names tell
 * apart. A name that ends in brackets, such as "Brick (Run)", takes the time inside them.
 */
export function withStartTimesWhereShared<T extends { name: string; startMs: number }>(
  activities: readonly T[],
): T[] {
  const shared = countNames(activities)
  const timed = activities.map((activity) =>
    (shared.get(activity.name) ?? 0) < 2
      ? activity
      : Object.assign({}, activity, { name: withClock(activity.name, activity.startMs) }),
  )
  // Legs that still share a name start in the same minute. They are numbered in the file's order.
  const repeated = countNames(timed)
  const seen = new Map<string, number>()
  return timed.map((activity) => {
    if ((repeated.get(activity.name) ?? 0) < 2) return activity
    const ordinal = (seen.get(activity.name) ?? 0) + 1
    seen.set(activity.name, ordinal)
    return ordinal === 1
      ? activity
      : Object.assign({}, activity, { name: `${activity.name} (${ordinal})` })
  })
}

function countNames(activities: readonly { name: string }[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const activity of activities) counts.set(activity.name, (counts.get(activity.name) ?? 0) + 1)
  return counts
}

function withClock(name: string, startMs: number): string {
  const time = formatTimeOfDay(startMs)
  return name.endsWith(')') ? `${name.slice(0, -1)}, ${time})` : `${name}, ${time}`
}
