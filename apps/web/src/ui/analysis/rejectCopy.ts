import type { RejectCode, RejectedFile } from '@rca/core/session'
import { plural } from '../components/plural'
import { sizeText } from '../format/units'

/** The one place a refused file's reason becomes words. The core's English reason is never shown. */

/**
 * The sports the app does not count, in words an athlete uses. A source names a sport its own way: FIT
 * as "walking" or "fitnessEquipment", Strava's export as "Walk" or "Weight Training". One table holds
 * both, and a name is matched without its case, spaces, dashes or underscores.
 */
const SPORT_SUBJECTS: ReadonlyArray<readonly [subject: string, names: readonly string[]]> = [
  ['A walk', ['walking', 'Walk']],
  ['A hike', ['hiking', 'Hike']],
  ['A swim', ['swimming', 'Swim']],
  [
    'A gym or fitness session',
    ['fitnessEquipment', 'Weight Training', 'Elliptical', 'Stair Stepper'],
  ],
  ['A training session', ['training', 'Workout']],
  ['A row', ['rowing', 'Row']],
  [
    'A ski session',
    ['skiing', 'alpineSkiing', 'crossCountrySkiing', 'Alpine Ski', 'Nordic Ski', 'Backcountry Ski'],
  ],
  ['A tennis session', ['tennis']],
]
const OTHER_SPORT_SUBJECT = 'Another sport'
const E_BIKE_LABEL = 'E-bike ride'

function nameKey(name: string): string {
  return name.toLowerCase().replace(/[\s_-]+/g, '')
}

const SUBJECT_OF_NAME: ReadonlyMap<string, string> = new Map(
  SPORT_SUBJECTS.flatMap(([subject, names]) =>
    names.map((name) => [nameKey(name), subject] as const),
  ),
)

/**
 * How a refused file names its sport: the table's word when it has one for the name, else the type
 * the export's list gives, which is already readable ("Kayaking"), else "Another sport". A name the
 * file gives and the table lacks, such as an unmapped FIT enum or a number, is not readable as it is.
 */
function sportName({ detail, listed }: RejectedFile): { subject: string; label: string } {
  const subject = detail === undefined ? undefined : SUBJECT_OF_NAME.get(nameKey(detail))
  if (subject !== undefined) return { subject, label: withoutArticle(subject) }
  if (listed === true && detail) return { subject: detail, label: detail }
  return { subject: OTHER_SPORT_SUBJECT, label: OTHER_SPORT_SUBJECT }
}

/** "A training session" as "Training session". */
function withoutArticle(subject: string): string {
  const noun = subject.replace(/^An? /, '')
  return `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`
}

/** A sport's name for a line of its own, such as "Training session". */
export function sportLabel(file: RejectedFile): string {
  return file.code === 'e-bike' ? E_BIKE_LABEL : sportName(file).label
}

export interface SportFiles {
  label: string
  files: RejectedFile[]
}

/** The files left out as other sports, one entry for each sport whichever source named it, the largest first. */
export function bySport(files: readonly RejectedFile[]): SportFiles[] {
  const sports = new Map<string, RejectedFile[]>()
  for (const file of files) {
    const label = sportLabel(file)
    const members = sports.get(label) ?? []
    members.push(file)
    sports.set(label, members)
  }
  return [...sports]
    .map(([label, members]) => ({ label, files: members }))
    .sort((a, b) => b.files.length - a.files.length || a.label.localeCompare(b.label))
}

const EXPORT_AGAIN = 'Export it again.'
const EXPORT_SHORTER_RANGE = 'Export a shorter range.'
const CHECK_RECORDING = 'Check the recording on your device, or export a shorter range.'

/**
 * The advice a reason gives, for the reasons the athlete can act on. A file that holds no points, or
 * does not say its sport, has none. A piece of advice is said once, in the first line that gives it.
 */
export const ADVICE: Partial<Record<RejectCode, string>> = {
  'not-activity': 'Export your activities as FIT, GPX or TCX files, then add them again.',
  corrupt: EXPORT_AGAIN,
  'too-large': EXPORT_SHORTER_RANGE,
  'too-much-data': EXPORT_SHORTER_RANGE,
  'too-short': CHECK_RECORDING,
  'too-sparse': CHECK_RECORDING,
  'too-long': CHECK_RECORDING,
  'no-date': CHECK_RECORDING,
  'implausible-date': CHECK_RECORDING,
}

/**
 * The sentence for each reason code, without the advice in ADVICE. The duplicate takes the detail the
 * core gives, and the sport takes the file, since the core also says whether its name is the list's.
 */
const REASON_COPY: Record<RejectCode, (detail: string | undefined, file: RejectedFile) => string> =
  {
    'not-activity': () => 'Not a FIT, GPX or TCX file, so it cannot be read.',
    corrupt: (detail) => corruptCopy(detail),
    empty: () => 'It holds no recorded points, so there is nothing to read.',
    'too-short': () => 'Too short: it records less than a minute.',
    'too-sparse': () => 'Recorded too sparsely: its points are more than 10 seconds apart.',
    'too-long': () => 'Longer than 48 hours, so it is left out.',
    'too-much-data': () => 'Too much data for one file.',
    'no-date': () => 'Its times are device time only, so it cannot be placed in your history.',
    'implausible-date': () => 'Its date is not plausible, so it is left out.',
    // The group says these were left out on purpose, so a line says only what the file is.
    'unsupported-sport': (_detail, file) => `${sportName(file).subject} is not a run or a ride.`,
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

/**
 * The plain sentence for one refused file. Its advice follows when the file carries it, which is the
 * default. A line that does not carry the advice leaves it out.
 */
export function rejectionCopy(file: RejectedFile, carriesAdvice = true): string {
  const sentence = REASON_COPY[file.code](file.detail, file)
  const advice = ADVICE[file.code]
  return advice === undefined || !carriesAdvice ? sentence : `${sentence} ${advice}`
}

/**
 * The line for the files in a format the app does not read, which are counted and not named. It carries
 * the advice of a file that is not an activity, unless a named one has already said it.
 */
export function unreadFormatsCopy(count: number, carriesAdvice: boolean): string {
  const sentence = `${plural(count, 'file')} in a format this app does not read.`
  return carriesAdvice ? `${sentence} ${ADVICE['not-activity']}` : sentence
}

/** The files whose line carries its advice: the first file that gives each piece of it. */
export function adviceCarriers(files: readonly RejectedFile[]): ReadonlySet<RejectedFile> {
  const said = new Set<string>()
  const carriers = new Set<RejectedFile>()
  for (const file of files) {
    const advice = ADVICE[file.code]
    if (advice === undefined || said.has(advice)) continue
    said.add(advice)
    carriers.add(file)
  }
  return carriers
}

export type SkippedGroup = 'need-a-look' | 'other-sports' | 'already-added'

const GROUP_TITLE: Record<SkippedGroup, string> = {
  'need-a-look': 'Need a look',
  'other-sports': 'Other sports, left out on purpose',
  'already-added': 'Already added',
}
const UNLISTED_TITLE = 'Not listed as activities, such as saved routes'

/** The note under the copies already added, the one group whose files are not a problem and not a sport. */
export const ALREADY_ADDED_NOTE =
  'Only one copy of a workout is kept, so these were not counted twice.'

/** A group's title with its file count, such as "Need a look: 35 files". */
export function groupTitle(group: SkippedGroup, count: number): string {
  return `${GROUP_TITLE[group]}: ${plural(count, 'file')}`
}

/** The title of the line for the files an export's list does not name, which has no files to list. */
export function unlistedTitle(count: number): string {
  return `${UNLISTED_TITLE}: ${plural(count, 'file')}`
}

const GROUP_OF: Record<RejectCode, SkippedGroup> = {
  'not-activity': 'need-a-look',
  corrupt: 'need-a-look',
  empty: 'need-a-look',
  unreadable: 'need-a-look',
  'no-sport': 'need-a-look',
  'too-short': 'need-a-look',
  'too-sparse': 'need-a-look',
  'too-long': 'need-a-look',
  'too-much-data': 'need-a-look',
  'too-large': 'need-a-look',
  'no-date': 'need-a-look',
  'implausible-date': 'need-a-look',
  'unsupported-sport': 'other-sports',
  'e-bike': 'other-sports',
  duplicate: 'already-added',
}

/** The refused files in their groups, each in the order the files came. */
export function groupRejected(
  files: readonly RejectedFile[],
): Record<SkippedGroup, RejectedFile[]> {
  const groups: Record<SkippedGroup, RejectedFile[]> = {
    'need-a-look': [],
    'other-sports': [],
    'already-added': [],
  }
  for (const file of files) groups[GROUP_OF[file.code]].push(file)
  return groups
}
