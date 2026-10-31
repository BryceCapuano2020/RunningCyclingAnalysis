import { isAnalysed } from '@rca/core/digest/analysed'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { AthleteType } from '@rca/core/types'
import { workoutKey } from '@rca/core/session'
import type { Sport } from '@rca/core/types'
import { plural } from '../components/plural'
import type { Route } from '../route'

/*
 * Runs at walking pace: hikes recorded as runs. The core keeps them in the library and leaves them out of every
 * analysis (`ActivityDigest.walkingPace`); this is what the pages say about them.
 */

/** The mark on a list row and an activity's header. */
export const WALKING_PACE_CHIP = 'Walking pace'

/**
 * The runs of a sport that are all at walking pace and so all left out, with the way to count them. Pages that
 * would otherwise say the sport has no runs say this instead.
 */
export interface LeftOutRuns {
  sport: Sport
  count: number
  /** Counts them as runs. Whether the browser kept the choice is the controller's notKept. */
  onCount: () => void
}

/** The pages that carry the library line about runs at walking pace: where runs are listed or analysed. */
export const WALKING_NOTE_PAGES: readonly Route['page'][] = ['run', 'activities']

/** The line on an activity page, in the place of its best efforts. */
export const WALKING_PACE_NOTE =
  'This run is at walking pace, so it is left out of your run analysis.'

/**
 * The line under the import notices for the saved runs at walking pace. `offer` adds where to count one; the
 * Run page, when every run is left out, has its own button and leaves the sentence off.
 */
export function walkingPaceText(count: number, offer = true): string {
  const one = count === 1
  const said =
    `${plural(count, 'saved run is', 'saved runs are')} at walking pace, so ` +
    `${one ? 'it stays' : 'they stay'} in your activities and ` +
    `${one ? 'is' : 'are'} left out of your run analysis.`
  return offer ? `${said} Open ${one ? 'it' : 'one'} to count it as a run.` : said
}

/**
 * The line about left-out runs the athlete counts, with the button to leave them out beside it. A run is left out for
 * its pace or for the athlete's label, and counting it takes either away, so the line names neither.
 */
export function countedDespiteText(count: number): string {
  return `${plural(count, 'left-out run is', 'left-out runs are')} counted.`
}

/**
 * What a page says in place of "no runs" when the runs it would show are all at walking pace: how many are left
 * out, and that the athlete can count them. Said wherever the library holds runs the analysis does not.
 */
export function leftOutNote(count: number): string {
  const one = count === 1
  return (
    `${plural(count, 'run is', 'runs are')} at walking pace, so ${one ? 'it is' : 'they are'} left out. ` +
    `Count ${one ? 'it as a run' : 'them as runs'} to include ${one ? 'it' : 'them'}.`
  )
}

/** The short form, for a tile beside a headline that already says it all and offers the button. */
export function leftOutShort(count: number): string {
  return `${plural(count, 'run')} left out at walking pace.`
}

/** The button that counts runs at walking pace, for the one run or for all of them. */
export function countRunsLabel(count: number): string {
  return count === 1 ? 'Count this run' : 'Count these runs'
}

/** The workout key a choice to count a run is kept under: the same for every copy of the workout. */
export function workoutKeyOf(activity: Pick<ActivitySummary, 'sport' | 'startMs'>): string {
  return workoutKey(activity.sport, activity.startMs)
}

/**
 * The runs at walking pace in a library, and whether they are all of the sport's activities there: every run
 * the analysis would use is left out, so the sport's pages have nothing and must say why.
 */
export function leftOutRuns(library: ActivitySummary[]): {
  runs: ActivitySummary[]
  allLeftOut: boolean
} {
  // The runs the athlete can count by their pace; one the athlete labelled is left out for that, and is said apart.
  const runs = library.filter(
    (activity) => activity.walkingPace === true && activity.athleteType === undefined,
  )
  const sport = runs[0]?.sport
  const allLeftOut =
    sport !== undefined &&
    !library.some((activity) => activity.sport === sport && isAnalysed(activity))
  return { runs, allLeftOut }
}

/**
 * The library as the analysis holds it: without the runs at walking pace. The counts and dates a page gives
 * of what the analysis rests on come from here, so a library of hikes does not read as one of runs.
 */
export function withoutWalking(library: ActivitySummary[]): ActivitySummary[] {
  return library.filter(isAnalysed)
}

/** The mark on a list row of an activity the athlete labelled, by the label. */
export const ATHLETE_LABEL_CHIP: Record<AthleteType, string> = {
  walk: 'Walk',
  hike: 'Hike',
  ski: 'Ski',
  other: 'Other activity',
}

/** The line on an activity page the athlete labelled in the export, in the place of its best efforts. */
export function labelledNote(label: AthleteType): string {
  return `You labelled this activity ${ATHLETE_LABEL_CHIP[label]} in your export, so it is left out of your run and ride analysis.`
}

/**
 * The line under the import notices for saved activities the athlete labelled Hike, Walk, a ski or another type in
 * the export: they stay in the activities and are left out of the run and ride analysis. Said once, apart from
 * the walking-pace line, and counted apart: an activity with both is in this count only.
 */
export function labelledText(count: number): string {
  const one = count === 1
  return (
    `${plural(count, 'saved activity is', 'saved activities are')} labelled Hike, Walk or another type in your export, so ` +
    `${one ? 'it stays' : 'they stay'} in your activities and ${one ? 'is' : 'are'} left out of your analysis. ` +
    `Open ${one ? 'it' : 'one'} to count it as a run or ride.`
  )
}
