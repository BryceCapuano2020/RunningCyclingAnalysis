import { formatDuration } from '../units'
import {
  PROFILE_LONG_S,
  PROFILE_MAX_NAMED,
  PROFILE_NAMED_MARGIN,
  PROFILE_MIN_DURATIONS,
  PROFILE_MIN_SESSIONS,
  PROFILE_MIN_S,
  shortEndOf,
} from './constants'
import type { ProfileGap, ProfileRow, ReadyProfile } from './durationProfile'

/** A duration as the caller writes it, such as "20 min". */
export type DurationName = (durationS: number) => string

const LOW_OR_UNTESTED = 'it may be relatively low, or untested'

/** Whether a row's interval clears zero by PROFILE_NAMED_MARGIN: enough to name in the sentence. */
function isClear(row: ProfileRow): boolean {
  if (row.standsOut === 'above') return row.low >= PROFILE_NAMED_MARGIN
  return row.standsOut === 'below' && row.high <= -PROFILE_NAMED_MARGIN
}

/** The rows that stand out most and clearly, at most PROFILE_MAX_NAMED, shortest duration first. */
function namedRows(rows: readonly ProfileRow[]): ProfileRow[] {
  return rows
    .filter(isClear)
    .sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual))
    .slice(0, PROFILE_MAX_NAMED)
    .sort((a, b) => a.durationS - b.durationS)
}

/**
 * One sentence on what stands out, or that nothing does. It names only the durations whose interval clears zero by a
 * margin, and says a low best may be relatively low or untested, since a best is a lower bound. A duration that
 * stands out by less is left to the chart, and with only those the sentence says nothing stands out clearly. Durations
 * are named by `name`. `allTime` says the bests are the whole library's ("Your all-time 5 min best").
 */
export function profileSentence(
  { rows }: ReadyProfile,
  name: DurationName,
  { allTime = false }: { allTime?: boolean } = {},
): string {
  const named = namedRows(rows)
  if (named.length === 0) {
    return rows.some((row) => row.standsOut !== null)
      ? 'Nothing stands out clearly.'
      : 'Nothing stands out.'
  }
  const lows = named.filter((row) => row.standsOut === 'below').length
  const sentences = named.map((row, i) => {
    const size = Math.max(1, Math.round(Math.abs(row.residual) * 100))
    const where = row.standsOut === 'below' ? 'below' : 'above'
    const suggest = i === 0 ? ' what your other bests suggest' : ''
    const why = row.standsOut === 'below' && lows === 1 ? `: ${LOW_OR_UNTESTED}` : ''
    return `Your ${allTime ? 'all-time ' : ''}${name(row.durationS)} best is ${size}% ${where}${suggest}${why}.`
  })
  if (lows > 1) sentences.push('Those below may be relatively low, or untested.')
  return sentences.join(' ')
}

/** What a profile still needs, in words and without a full stop, such as "Needs a best at 1 min or under". */
export function profileNeeds(
  missing: readonly ProfileGap[],
  startS: number = PROFILE_MIN_S,
): string {
  const short = `a best at ${formatDuration(shortEndOf(startS))} or under`
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

/** What to say when the bests are all there but no curve could be fitted to them. */
export const PROFILE_UNFIT_TEXT = 'A curve could not be fitted to your bests, so none is compared'
