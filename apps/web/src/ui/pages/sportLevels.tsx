import type { ReactNode } from 'react'
import { HALF_MARATHON_M } from '@rca/core/constants'
import type { AgeProfile, LevelBand } from '@rca/core/grade'
import type { LevelAge } from '@rca/core/standing'
import { rideLevelPowers, runLevelTimes } from '@rca/core/standing'
import type { Sport } from '@rca/core/types'
import { levelRangeRows } from '../levelRanges'
import { sportHalfFor } from '../runHalf'
import { thresholdGrade } from '../thresholdGrade'
import { anchorOf } from './sectionAnchor'
import { LevelRanges } from './LevelRanges'
import type { SectionContext } from './sportPageProps'

/**
 * Each sport's levels in its own headline figure, from core's inverse of the grade the sport goes through: a run's in half marathon
 * times, a ride's in hour power at the athlete's mass, read at the age the sport's grade was taken at.
 */
const BANDS: Record<
  Sport,
  (context: SectionContext, profile: AgeProfile, at: LevelAge) => LevelBand[] | null
> = {
  run: (_context, profile, at) => runLevelTimes(profile, at, HALF_MARATHON_M),
  ride: (context, profile, at) => rideLevelPowers(profile, at, context.massKg),
}

/**
 * Whether a sport's table is in a forecast's figure, so its row is marked only when the grade is that forecast's: a run's table is
 * in half times, and a run graded by its threshold (no forecast) is on the hour standard, not the half's.
 */
const MARKED_BY_HALF: Record<Sport, boolean> = { run: true, ride: false }

/**
 * The sport's Levels table, or null while the year of birth or sex is missing (a ride waits on its body mass at the page, which
 * holds its sections until the weight is entered). The athlete's own row is the level the hero names; a run with no forecast half
 * has no row marked, as its grade is on the hour standard and the table is in half times.
 */
export function levelsContent(context: SectionContext): ReactNode | null {
  const { sport, profile, result, units } = context
  if (profile === null) return null
  // The run's own row is the level of its forecast half, the grade Balance and the hero name; with none, its threshold's.
  const half = sportHalfFor(sport, {
    result,
    rangeDays: context.rangeDays,
    library: context.library,
    heartRateJudgement: context.heartRateJudgement,
    periodEndMs: context.periodEndMs,
  })
  const graded = thresholdGrade(result, sport, profile, half)
  // The bands are read at the grade's own age, so the mark and the figures agree across a birthday; with no grade, today's.
  const bands = BANDS[sport](
    context,
    profile,
    graded.kind === 'graded' ? { age: graded.age } : context.openedAt,
  )
  if (bands === null) return null
  const marked = graded.kind === 'graded' && (!MARKED_BY_HALF[sport] || half !== null)
  const mine = marked ? graded.grade.centre.level : null
  return (
    <LevelRanges
      sport={sport}
      rows={levelRangeRows(sport, bands, units, mine)}
      headingId={`${anchorOf(sport, 'levels')}-title`}
    />
  )
}
