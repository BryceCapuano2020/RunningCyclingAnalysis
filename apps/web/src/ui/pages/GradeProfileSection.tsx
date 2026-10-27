import { useMemo } from 'react'
import type { AnalysisResult } from '@rca/core/pipeline'
import { GradeProfileChart } from '../charts'
import { GRADE_PROFILE_TITLE } from '../charts/gradeProfileText'
import { gradeProfile, profileFinding } from '../gradeProfile'
import type { AgeProfile } from '../grades'

export interface GradeProfileSectionProps {
  result: AnalysisResult
  /** The year of birth and sex for the grades, or null while either is missing. */
  profile: AgeProfile | null
  /** False while no body weight is entered: a ride's grade waits for it, so there is nothing to compare. */
  weightKnown: boolean
}

/**
 * How the two sports' age grades compare from 3 to 60 min, with the finding as its lede. It is left out
 * without the year of birth and sex, without a weight, and with fewer than two durations graded in both
 * sports, since a chart that would only repeat the balance at 20 min says nothing more.
 */
export function GradeProfileSection({ result, profile, weightKnown }: GradeProfileSectionProps) {
  // Memoised on the two profile values, not the object, which the caller builds afresh on each render.
  const birthYear = profile?.birthYear ?? null
  const sex = profile?.sex ?? null
  const graded = useMemo(
    () =>
      weightKnown && birthYear !== null && sex !== null
        ? gradeProfile(result, { birthYear, sex })
        : null,
    [result, birthYear, sex, weightKnown],
  )
  const finding = graded === null ? null : profileFinding(graded)
  if (graded === null || finding === null) return null
  return (
    <section className="section" aria-labelledby="balance-profile">
      {/* The chart's own title, shown once by the chart; the heading names the section the same way. */}
      <h2 id="balance-profile" className="sr-only">
        {GRADE_PROFILE_TITLE}
      </h2>
      <GradeProfileChart profile={graded} finding={finding} />
    </section>
  )
}
