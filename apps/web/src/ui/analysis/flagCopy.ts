import type { QualityFlag, QualityKind } from '@rca/core/types'
import { formatDuration } from '@rca/core/units'
import { formatCount } from '../format/count'

/**
 * The data-quality flags of an activity, in the words the activity page shows. The core gives each a
 * kind and a span in seconds; this is the one place that says what a kind means to the athlete.
 */

type FlagSpan = Pick<QualityFlag, 'kind' | 'start' | 'end'>

/** m:ss, or h:mm:ss from an hour, for a point in the activity. */
function clockText(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`
}

const timesText = (count: number) => (count === 1 ? 'once' : `${formatCount(count)} times`)

const leftOut = (count: number) => `We left ${count === 1 ? 'that' : 'those'} out of your figures.`

// The grade is masked around a jump, so the climb and the slope-based figures near it are left out.
const jumpLeftOut = (count: number) =>
  `We left the climb and the slope-based figures near ${count === 1 ? 'that jump' : 'each jump'} out of your figures.`

interface KindCopy {
  /** Whether its readings were left out of the figures, so they count as readings skipped. */
  removesReadings: boolean
  /** Whether each occurrence is listed under the kind, with the time it covers. */
  listsTimes: boolean
  sentence: (count: number) => string
}

/** A kind whose readings were left out of the figures. */
function skipped(label: string): KindCopy {
  return {
    removesReadings: true,
    listsTimes: true,
    sentence: (count) => `${label} ${timesText(count)}. ${leftOut(count)}`,
  }
}

const KIND_COPY: Record<QualityKind, KindCopy> = {
  'hr-implausible-for-power': skipped('Heart rate looked too low for your power'),
  'hr-dropout': skipped('Heart rate was missing or too low while moving'),
  'hr-spike': skipped('Heart rate jumped suddenly'),
  'power-spike': skipped('The power meter reported a sudden spike'),
  'power-dropout': skipped('The power meter stopped reporting while moving'),
  'speed-spike': skipped('GPS speed jumped suddenly'),
  'altitude-jump': {
    removesReadings: false,
    listsTimes: true,
    sentence: (count) =>
      `Altitude jumped in a single second ${timesText(count)}. ${jumpLeftOut(count)}`,
  },
  // The core flags a missing altitude once, for the whole activity, so there is no count to give.
  'missing-altitude': {
    removesReadings: false,
    listsTimes: false,
    sentence: () => 'No altitude was recorded, so climb and slope-based figures are not shown.',
  },
}

const KINDS = Object.keys(KIND_COPY) as QualityKind[]

/** The kinds with a count above zero, in the order the copy lists them. */
export function skippedKinds(counts: Partial<Record<QualityKind, number>>): QualityKind[] {
  return KINDS.filter((kind) => (counts[kind] ?? 0) > 0)
}

/** The readings left out of the figures: the counts of the kinds that remove readings, not the notes. */
export function skippedReadings(counts: Partial<Record<QualityKind, number>>): number {
  return KINDS.filter((kind) => KIND_COPY[kind].removesReadings).reduce(
    (sum, kind) => sum + (counts[kind] ?? 0),
    0,
  )
}

/** Whether each occurrence of a kind is listed under it, with its time. */
export function listsTimesOf(kind: QualityKind): boolean {
  return KIND_COPY[kind].listsTimes
}

/** One line for a kind, with its count: "Heart rate jumped suddenly 4 times." */
export function flagKindSentence(kind: QualityKind, count: number): string {
  return KIND_COPY[kind].sentence(count)
}

/** Where one reading sits, under its kind: "from 37:41 to 40:19, 2 min 38 s", or "at 12:34". */
export function flagSpanText(flag: FlagSpan): string {
  if (flag.kind === 'altitude-jump') return `at ${clockText(flag.start)}`
  const span = `from ${clockText(flag.start)} to ${clockText(flag.end)}`
  return `${span}, ${formatDuration(flag.end - flag.start)}`
}

/**
 * The count a page shows for readings left out of its figures. The count is of flags, each a stretch
 * of readings the digest merged, so the line says how many times the skipping happened.
 */
export function skippedReadingsText(count: number): string {
  return count === 1 ? 'Readings skipped once' : `Readings skipped ${formatCount(count)} times`
}
