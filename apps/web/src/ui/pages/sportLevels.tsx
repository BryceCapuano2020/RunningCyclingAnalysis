import type { ReactNode } from 'react'
import { HALF_MARATHON_M } from '@rca/core/constants'
import type { AgeProfile, LevelBand } from '@rca/core/grade'
import { rideLevelPowers, runLevelTimes } from '@rca/core/standing'
import type { Sport } from '@rca/core/types'
import { levelRangeRows } from '../levelRanges'
import { thresholdGrade } from '../thresholdGrade'
import { anchorOf } from './sectionAnchor'
import { LevelRanges } from './LevelRanges'
import type { SectionContext } from './sportPageProps'

/**
 * Each sport's levels in its own headline figure, from core's inverse of the grade the sport's threshold goes through: a run's in
 * half marathon times, a ride's in hour power at the athlete's mass. The age is the one on the day the page was opened.
 */
const BANDS: Record<Sport, (context: SectionContext, profile: AgeProfile) => LevelBand[] | null> = {
  run: (context, profile) => runLevelTimes(profile, context.openedAt, HALF_MARATHON_M),
  ride: (context, profile) => rideLevelPowers(profile, context.openedAt, context.massKg),
}

/**
 * The sport's Levels table, or null while the year of birth or sex is missing (a ride waits on its body mass at the page, which
 * holds its sections until the weight is entered). The athlete's own row is the level of the grade their threshold has, the one the
 * hero names.
 */
export function levelsContent(context: SectionContext): ReactNode | null {
  const { sport, profile, result, units } = context
  if (profile === null) return null
  const bands = BANDS[sport](context, profile)
  if (bands === null) return null
  const graded = thresholdGrade(result, sport, profile)
  const mine = graded.kind === 'graded' ? graded.grade.centre.level : null
  return (
    <LevelRanges
      sport={sport}
      rows={levelRangeRows(sport, bands, units, mine)}
      headingId={`${anchorOf(sport, 'levels')}-title`}
    />
  )
}
