import type { Sport } from '@rca/core/types'
import { SPORT_ORDER, SPORT_TITLE } from './sports'
import { formatHours } from './weeklyVolume'
import type { VolumeWeek } from './weeklyVolume'

/** How many percentage points a sport's share of the hours must move between the halves to be the finding. */
export const SHIFT_MIN_POINTS = 15
/** How much a lone sport's weekly hours must change between the halves, as a fraction, to be the finding. */
export const CHANGE_MIN_FRACTION = 0.25

/** Two shifts closer than this, in percentage points, are equal: the shares are ratios, so equal moves can differ by noise. */
const TIE_POINTS = 1e-9
/** A lone sport's first half must average at least this many seconds a week for a change from it to be a finding. */
const MIN_BEFORE_S = 1800

type Seconds = Record<Sport, number>

function sportSeconds(weeks: readonly VolumeWeek[]): Seconds {
  const sum = Object.fromEntries(SPORT_ORDER.map((sport) => [sport, 0])) as Seconds
  for (const week of weeks) for (const sport of SPORT_ORDER) sum[sport] += week.seconds[sport]
  return sum
}

function allSeconds(seconds: Seconds): number {
  return SPORT_ORDER.reduce((sum, sport) => sum + seconds[sport], 0)
}

/** A sport's share of the hours as a whole percent. */
function percent(seconds: Seconds, sport: Sport): number {
  return Math.round((seconds[sport] / allSeconds(seconds)) * 100)
}

/** The sport that moved most in its share of the hours between the halves, and by how many points (negative for a fall). */
function biggestShift(first: Seconds, second: Seconds): { sport: Sport; points: number } | null {
  if (allSeconds(first) === 0 || allSeconds(second) === 0) return null
  const shifts = SPORT_ORDER.map((sport) => ({
    sport,
    points: (second[sport] / allSeconds(second) - first[sport] / allSeconds(first)) * 100,
  }))
  return shifts.reduce((best, shift) => (outweighs(shift.points, best.points) ? shift : best))
}

/**
 * Whether a shift beats the best so far: it is larger, or as large to within floating-point noise and a
 * rise, since a rise is the finding when a rise and a fall are equal, as with two sports.
 */
function outweighs(points: number, best: number): boolean {
  const size = Math.abs(points) - Math.abs(best)
  return size > TIE_POINTS || (Math.abs(size) <= TIE_POINTS && points > best)
}

/** The line for a period that holds more than one sport. */
function mixedCaption(first: Seconds, second: Seconds, whole: Seconds): string {
  const shift = biggestShift(first, second)
  if (shift !== null && Math.abs(shift.points) >= SHIFT_MIN_POINTS) {
    const verb = shift.points > 0 ? 'rose' : 'fell'
    return `${SPORT_TITLE[shift.sport]} ${verb} from ${percent(first, shift.sport)}% of your hours in the first half to ${percent(second, shift.sport)}% in the second.`
  }
  const top = SPORT_ORDER.reduce((best, sport) => (whole[sport] > whole[best] ? sport : best))
  return `${SPORT_TITLE[top]} was ${percent(whole, top)}% of your hours over these weeks.`
}

/** The line for a period that holds one sport: how its weekly hours moved, or what they averaged. */
function lonelyCaption(sport: Sport, halves: [Seconds, Seconds], weeks: number): string {
  const [first, second] = halves
  const half = Math.floor(weeks / 2)
  const before = first[sport] / half
  const after = second[sport] / (weeks - half)
  const moved = Math.abs(after - before) / before >= CHANGE_MIN_FRACTION
  // A change from almost nothing, or one that two rounded figures would hide, is not worth stating.
  if (before >= MIN_BEFORE_S && moved && formatHours(before) !== formatHours(after)) {
    const verb = after > before ? 'rose' : 'fell'
    return `${SPORT_TITLE[sport]} ${verb} from ${formatHours(before)} h a week in the first half to ${formatHours(after)} h in the second.`
  }
  return `${SPORT_TITLE[sport]} averaged ${formatHours((first[sport] + second[sport]) / weeks)} h a week over these weeks.`
}

/**
 * The one line under the volume strip, chosen for what it tells that the bars do not say outright. With
 * more than one sport: the biggest move in a sport's share of the hours between the first and second half
 * of the weeks, when it is SHIFT_MIN_POINTS or more, else the share of the sport with the most hours. With
 * one sport: how its weekly hours moved between the halves when they changed by CHANGE_MIN_FRACTION, else
 * what they averaged.
 */
export function volumeCaption(weeks: readonly VolumeWeek[]): string {
  const half = Math.floor(weeks.length / 2)
  const first = sportSeconds(weeks.slice(0, half))
  const second = sportSeconds(weeks.slice(half))
  const whole = sportSeconds(weeks)
  const present = SPORT_ORDER.filter((sport) => whole[sport] > 0)
  const [only] = present
  if (only !== undefined && present.length === 1) {
    return lonelyCaption(only, [first, second], weeks.length)
  }
  return mixedCaption(first, second, whole)
}
