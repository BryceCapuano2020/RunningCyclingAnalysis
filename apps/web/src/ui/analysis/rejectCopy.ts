import type { RejectCode, RejectedFile } from '@rca/core/session'
import { plural } from '../components/plural'
import { sizeText } from '../format/units'

/** The one place a refused file's reason becomes words. The core's English reason is never shown. */

/** How a source names a sport the app does not count, in words an athlete uses, keyed by lowercase name. */
const SPORT_SUBJECTS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    walking: 'A walk',
    hiking: 'A hike',
    swimming: 'A swim',
    fitnessEquipment: 'A gym or fitness session',
    training: 'A training session',
    rowing: 'A row',
    skiing: 'A ski session',
    alpineSkiing: 'A ski session',
    crossCountrySkiing: 'A ski session',
    tennis: 'A tennis session',
  }).map(([label, subject]) => [label.toLowerCase(), subject] as const),
)
const OTHER_SPORT_SUBJECT = 'Another sport'

function sportSubject(label: string | undefined): string {
  return (
    (label === undefined ? undefined : SPORT_SUBJECTS.get(label.toLowerCase())) ??
    OTHER_SPORT_SUBJECT
  )
}

/** The sentence for each reason code. The duplicate and the sport take the detail the core gives. */
const REASON_COPY: Record<RejectCode, (detail: string | undefined) => string> = {
  'not-activity': () => 'Not a FIT, GPX or TCX file, so it cannot be read.',
  corrupt: (detail) => corruptCopy(detail),
  empty: () => 'It has no activity records in it.',
  'too-short': () => 'Too short: it records less than a minute.',
  'too-sparse': () => 'Recorded too sparsely: its points are more than 10 seconds apart.',
  'too-long': () => 'Longer than 48 hours, so it is left out.',
  'too-much-data': () => 'Too much data for one file. Export a shorter range.',
  'no-date': () => 'Its times are device time only, so it cannot be placed in your history.',
  'implausible-date': () => 'Its date is not plausible, so it is left out.',
  'unsupported-sport': (detail) =>
    `${sportSubject(detail)} is not a run or a ride, so it was left out on purpose.`,
  'no-sport': () => 'It does not say whether it is a run or a ride, so it is not guessed.',
  'e-bike': () => 'E-bike rides are left out, because motor help hides your own power.',
  duplicate: (detail) =>
    `Same workout as ${detail ?? 'another file'}, so it was not counted twice.`,
  unreadable: () => 'This file could not be read.',
  'too-large': () => 'Too large to read. Export a shorter range.',
}

/** A damaged file, or an archive that lost entries: the count the core gives is the detail. */
function corruptCopy(detail: string | undefined): string {
  const count = Number(detail)
  if (detail === undefined || !Number.isInteger(count) || count < 1) {
    return 'Damaged, so it could not be read.'
  }
  return `${plural(count, 'entry', 'entries')} could not be read because the archive is damaged.`
}

/** The size limit, as the core gives it in bytes, in whole megabytes. */
function tooLargeCopy(detail: string | undefined): string {
  const bytes = Number(detail)
  if (detail === undefined || !Number.isFinite(bytes)) return REASON_COPY['too-large'](undefined)
  return `Too large to read (over ${sizeText(bytes)}). Export a shorter range.`
}

/** The plain sentence for one refused file. */
export function rejectionCopy(file: RejectedFile): string {
  if (file.code === 'too-large') return tooLargeCopy(file.detail)
  return REASON_COPY[file.code](file.detail)
}

export type SkippedGroup =
  'not-activity' | 'damaged' | 'not-run-or-ride' | 'not-usable' | 'duplicate'

/** The groups in the order they are listed, each with its title and one suggested action. */
export const SKIPPED_GROUP_COPY: Readonly<
  Record<SkippedGroup, { title: (count: number) => string; action: string }>
> = {
  'not-activity': {
    title: (count) => `Not an activity file: ${plural(count, 'file')}`,
    action: 'Export your activities as FIT, GPX or TCX files, then add them again.',
  },
  damaged: {
    title: (count) => `Damaged or empty: ${plural(count, 'file')}`,
    action: 'Export the file again from your device or app.',
  },
  'not-run-or-ride': {
    title: (count) => `Not a run or a ride: ${plural(count, 'file')}`,
    action: 'Only runs and rides are analysed, so these were left out on purpose.',
  },
  'not-usable': {
    title: (count) => `Too short, too large or not recorded properly: ${plural(count, 'file')}`,
    action: 'Check the recording on your device, or export a shorter range.',
  },
  duplicate: {
    title: (count) => `Already added: ${plural(count, 'file')}`,
    action: 'Only one copy of a workout is kept, so these were not counted twice.',
  },
}

const GROUP_OF: Record<RejectCode, SkippedGroup> = {
  'not-activity': 'not-activity',
  corrupt: 'damaged',
  empty: 'damaged',
  unreadable: 'damaged',
  'unsupported-sport': 'not-run-or-ride',
  'no-sport': 'not-run-or-ride',
  'e-bike': 'not-run-or-ride',
  'too-short': 'not-usable',
  'too-sparse': 'not-usable',
  'too-long': 'not-usable',
  'too-much-data': 'not-usable',
  'too-large': 'not-usable',
  'no-date': 'not-usable',
  'implausible-date': 'not-usable',
  duplicate: 'duplicate',
}

export interface SkippedFiles {
  group: SkippedGroup
  files: RejectedFile[]
}

/** The refused files in their groups, in the order the groups are listed. Empty groups are left out. */
export function groupRejected(files: RejectedFile[]): SkippedFiles[] {
  const order = Object.keys(SKIPPED_GROUP_COPY) as SkippedGroup[]
  return order.flatMap((group) => {
    const members = files.filter((file) => GROUP_OF[file.code] === group)
    return members.length === 0 ? [] : [{ group, files: members }]
  })
}
