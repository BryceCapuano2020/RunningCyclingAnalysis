import { formatDuration } from '../units'
import {
  PROFILE_ANCHOR_S,
  PROFILE_FLOOR_S,
  PROFILE_LONG_S,
  PROFILE_MAX_NAMED,
  PROFILE_MIN_DURATIONS,
  PROFILE_MIN_SESSIONS,
  PROFILE_SHORT_S,
} from './constants'
import type { ProfileGap, ProfileRow, ReadyProfile } from './durationProfile'

/** A duration as the caller writes it, such as "20 min". */
export type DurationName = (durationS: number) => string

const LOW_OR_UNTESTED = 'it may be relatively low, or untested'

/** The rows that stand out most, at most PROFILE_MAX_NAMED, shortest duration first. */
function namedRows(rows: readonly ProfileRow[]): ProfileRow[] {
  return rows
    .filter((row) => row.standsOut !== null)
    .sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual))
    .slice(0, PROFILE_MAX_NAMED)
    .sort((a, b) => a.durationS - b.durationS)
}

/**
 * One sentence on what stands out, or that nothing does. It says a low best may be relatively low or
 * untested, since a best is a lower bound. Durations are named by `name`.
 */
export function profileSentence({ rows }: ReadyProfile, name: DurationName): string {
  const named = namedRows(rows)
  if (named.length === 0) {
    const first = rows[0]!.durationS
    const last = rows.at(-1)!.durationS
    return `Your bests are in line with each other from ${name(first)} to ${name(last)}.`
  }
  const lows = named.filter((row) => row.standsOut === 'below').length
  const sentences = named.map((row, i) => {
    const size = Math.max(1, Math.round(Math.abs(row.residual) * 100))
    const where = row.standsOut === 'below' ? 'below' : 'above'
    const suggest = i === 0 ? ' what your other bests suggest' : ''
    const why = row.standsOut === 'below' && lows === 1 ? `: ${LOW_OR_UNTESTED}` : ''
    return `Your ${name(row.durationS)} best is ${size}% ${where}${suggest}${why}.`
  })
  if (lows > 1) sentences.push('Those below may be relatively low, or untested.')
  return sentences.join(' ')
}

/** What a profile still needs, in words and without a full stop, such as "Needs a best at 1 min or under". */
export function profileNeeds(missing: readonly ProfileGap[]): string {
  const short = `a best at ${formatDuration(PROFILE_SHORT_S)} or under`
  const long = `a best at ${formatDuration(PROFILE_LONG_S)} or more`
  const needsShort = missing.includes('short')
  const needsLong = missing.includes('long')
  const ends = [needsShort ? short : null, needsLong ? long : null].filter((end) => end !== null)
  const items = [
    missing.includes('durations') ? `bests at ${PROFILE_MIN_DURATIONS} or more durations` : null,
    // Both ends read as one item: "a best at 1 min or under and one at 12 min or more".
    needsShort && needsLong
      ? `${short} and one at ${formatDuration(PROFILE_LONG_S)} or more`
      : (ends[0] ?? null),
    // Bests are named once, by whichever item comes first.
    missing.includes('sessions')
      ? `${missing.includes('durations') ? '' : 'bests '}from ${PROFILE_MIN_SESSIONS} or more sessions`
      : null,
  ].filter((item) => item !== null)
  const last = items.pop() ?? ''
  return `Needs ${items.length === 0 ? last : `${items.join(', ')} and ${last}`}`
}

/**
 * Why the short end is left out, or null when it is shown. Without a best at 15 s or under, Morton's
 * maximal power is not inferred, so only the durations from 2 min are compared.
 */
export function profileShortNote({ anchored }: ReadyProfile, name: DurationName): string | null {
  return anchored
    ? null
    : `Shown from ${name(PROFILE_FLOOR_S)}: there is no best at ${name(PROFILE_ANCHOR_S)} or under to anchor the short end.`
}
