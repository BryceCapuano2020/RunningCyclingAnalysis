import type { ReactNode } from 'react'
import { HALF_MARATHON_M } from '@rca/core/constants'
import type { AgeProfile, LevelBand } from '@rca/core/grade'
import { rideLevelPowers, runLevelTimes } from '@rca/core/standing'
import type { Sport } from '@rca/core/types'
import { levelRangeRows } from '../levelRanges'
import { halfForecastFor } from '../runHalf'
import { thresholdGrade } from '../thresholdGrade'
import { anchorOf } from './sectionAnchor'
import { LevelRanges } from './LevelRanges'
import type { SectionContext } from './sportPageProps'

/**
 * Each sport's levels in its own headline figure, from core's inverse of the grade the sport goes through: a run's in half marathon
 * times, a ride's in hour power at the athlete's mass. The age is the one the run's forecast half is graded at (`atMs`), or the
 * day the page was opened without one.
 */
const BANDS: Record<
  Sport,
  (context: SectionContext, profile: AgeProfile, atMs: number) => LevelBand[] | null
> = {
  run: (_context, profile, atMs) => runLevelTimes(profile, atMs, HALF_MARATHON_M),
  ride: (context, profile, atMs) => rideLevelPowers(profile, atMs, context.massKg),
}

/**
 * The sport's Levels table, or null while the year of birth or sex is missing (a ride waits on its body mass at the page, which
 * holds its sections until the weight is entered). The athlete's own row is the level the hero names.
 */
export function levelsContent(context: SectionContext): ReactNode | null {
  const { sport, profile, result, units } = context
  if (profile === null) return null
  // The run's own row is the level of its forecast half, the grade Balance and the hero name; with none, its threshold's.
  const half =
    sport === 'run'
      ? halfForecastFor({
          result,
          rangeDays: context.rangeDays,
          library: context.library,
          heartRateJudgement: context.heartRateJudgement,
          periodEndMs: context.periodEndMs,
        })
      : null
  const bands = BANDS[sport](context, profile, half?.atMs ?? context.openedAt)
  if (bands === null) return null
  const graded = thresholdGrade(result, sport, profile, half)
  const mine = graded.kind === 'graded' ? graded.grade.centre.level : null
  return (
    <LevelRanges
      sport={sport}
      rows={levelRangeRows(sport, bands, units, mine)}
      headingId={`${anchorOf(sport, 'levels')}-title`}
    />
  )
}
