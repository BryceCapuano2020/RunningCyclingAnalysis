import type { RejectedFile } from '@rca/core/session'
import type { ImportOutcome } from '../../worker/protocol'
import { formatCount } from '../format/count'
import { plural } from '../components/plural'
import { groupRejected } from './rejectCopy'

/** What an import's tally is worked out from: its counts, and the refused files it lists. */
export type Counted = Pick<
  ImportOutcome,
  'filesAdded' | 'rejected' | 'duplicates' | 'notActivities' | 'skippedTypes'
>

/** Where each file of an import went. The parts add up to the files the import saw. */
export interface SkipTally {
  /** Files that kept an activity, whether the workout is new or was already held. */
  added: number
  /** Files that could not be used, including those in a format the app does not read. */
  needLook: number
  /** Files of sports the app does not count, which are left out on purpose. */
  otherSports: number
  /** Copies of workouts that are already held. */
  alreadyAdded: number
  /** Files in an export that its own list of activities does not name, such as saved routes. They are not read. */
  unlisted: number
}

/**
 * The tally of an import. The refused files are counted by the import, and the listed ones tell which
 * of them are other sports, so the rest need a look whether or not they are listed.
 */
export function tallyOf(outcome: Counted, rejected: readonly RejectedFile[]): SkipTally {
  const otherSports = groupRejected(rejected)['other-sports'].length
  const alreadyAdded = outcome.duplicates.length
  return {
    added: outcome.filesAdded ?? 0,
    needLook: outcome.rejected - otherSports,
    otherSports,
    alreadyAdded,
    unlisted: outcome.notActivities ?? 0,
  }
}

/** The files an import did not add. When it is nothing there is no summary of them to show. */
export function skippedTotal(tally: SkipTally): number {
  return tally.needLook + tally.otherSports + tally.alreadyAdded + tally.unlisted
}

/**
 * The headline over the groups, which adds up to every file: "118 files, 111 of them activity files:
 * 90 added, 9 need a look, ...". The activity files are the count the import's progress shows, so the
 * two agree; without files the export does not list, every file is one. A part with no files is left out.
 */
export function tallySentence(tally: SkipTally): string {
  const { added, needLook, otherSports, alreadyAdded, unlisted } = tally
  const parts: Array<[count: number, text: string]> = [
    [added, `${formatCount(added)} added`],
    [alreadyAdded, `${formatCount(alreadyAdded)} already added`],
    [needLook, `${formatCount(needLook)} ${needLook === 1 ? 'needs' : 'need'} a look`],
    [otherSports, `${plural(otherSports, 'other sport')} left out on purpose`],
    [unlisted, `${formatCount(unlisted)} not listed as activities`],
  ]
  const files = added + skippedTotal(tally)
  const shown = parts.filter(([count]) => count > 0).map(([, text]) => text)
  // The progress bar counts activity files, which the files the export does not list are not.
  const activity = files - unlisted
  const activityFiles =
    unlisted > 0
      ? `, ${formatCount(activity)} of them ${activity === 1 ? 'an activity file' : 'activity files'}`
      : ''
  return `${plural(files, 'file')}${activityFiles}: ${shown.join(', ')}.`
}
