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

const EXPORT_AGAIN = 'Export it again.'
const EXPORT_SHORTER_RANGE = 'Export a shorter range.'

/**
 * The advice a reason's line gives, for the reasons whose line gives any. Its group's suggested action
 * gives the same advice once for all its files, so a line leaves it out when its group gives the action.
 */
const LINE_ADVICE: Partial<Record<RejectCode, string>> = {
  corrupt: EXPORT_AGAIN,
  'too-large': EXPORT_SHORTER_RANGE,
  'too-much-data': EXPORT_SHORTER_RANGE,
}

/**
 * The sentence for each reason code, without the advice in LINE_ADVICE. The duplicate and the sport take
 * the detail the core gives.
 */
const REASON_COPY: Record<RejectCode, (detail: string | undefined) => string> = {
  'not-activity': () => 'Not a FIT, GPX or TCX file, so it cannot be read.',
  corrupt: (detail) => corruptCopy(detail),
  empty: () => 'It has no activity records in it.',
  'too-short': () => 'Too short: it records less than a minute.',
  'too-sparse': () => 'Recorded too sparsely: its points are more than 10 seconds apart.',
  'too-long': () => 'Longer than 48 hours, so it is left out.',
  'too-much-data': () => 'Too much data for one file.',
  'no-date': () => 'Its times are device time only, so it cannot be placed in your history.',
  'implausible-date': () => 'Its date is not plausible, so it is left out.',
  'unsupported-sport': (detail) =>
    `${sportSubject(detail)} is not a run or a ride, so it was left out on purpose.`,
  'no-sport': () => 'It does not say whether it is a run or a ride, so it is not guessed.',
  'e-bike': () => 'E-bike rides are left out, because motor help hides your own power.',
  duplicate: (detail) =>
    `Same workout as ${detail ?? 'another file'}, so it was not counted twice.`,
  unreadable: () => 'This file could not be read.',
  'too-large': (detail) => tooLargeCopy(detail),
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
  if (detail === undefined || !Number.isFinite(bytes)) return 'Too large to read.'
  return `Too large to read (over ${sizeText(bytes)}).`
}

/** Whether a refused file's reason gives advice in its line, so the line can carry it. */
export function lineNamesAction(file: RejectedFile): boolean {
  return LINE_ADVICE[file.code] !== undefined
}

/**
 * The plain sentence for one refused file. Its advice follows when the file carries it, which is the
 * default. A line that does not carry the advice leaves it out.
 */
export function rejectionCopy(file: RejectedFile, carriesAdvice = true): string {
  const sentence = REASON_COPY[file.code](file.detail)
  const advice = LINE_ADVICE[file.code]
  return advice === undefined || !carriesAdvice ? sentence : `${sentence} ${advice}`
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

/**
 * The refused files whose line carries its advice. A reason with advice carries it when its file is
 * alone in its group, or when it is the summary's first file, which sits under the count and shows
 * whether or not the group is open. Every other line leaves the advice out, so it is said once.
 */
export function adviceCarriers(
  groups: SkippedFiles[],
  first: RejectedFile | undefined,
): ReadonlySet<RejectedFile> {
  const carriers = new Set<RejectedFile>()
  for (const { files } of groups) {
    for (const file of files) {
      if (lineNamesAction(file) && (files.length === 1 || file === first)) carriers.add(file)
    }
  }
  return carriers
}

/** Whether a group shows its suggested action: it does not when one of its lines carries the advice. */
export function groupShowsAction(
  files: RejectedFile[],
  carriers: ReadonlySet<RejectedFile>,
): boolean {
  return !files.some((file) => carriers.has(file))
}
