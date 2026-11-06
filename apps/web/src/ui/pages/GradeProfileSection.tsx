import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AnalysisResult } from '@rca/core/pipeline'
import { GradeProfileChart } from '../charts'
import { GRADE_PROFILE_TITLE } from '../charts/gradeProfileText'
import { gradeProfile, profileComparable, profileSeparated } from '../gradeProfile'
import type { AgeProfile } from '../grades'
import './GradeProfileSection.css'

export interface GradeProfileSectionProps {
  result: AnalysisResult
  /** The year of birth and sex for the grades, or null while either is missing. */
  profile: AgeProfile | null
  /** The body mass in kg that the ride's extra equivalents are priced at. */
  massKg: number
  /** False while no body weight is entered: a ride's grade waits for it, so there is nothing to compare. */
  weightKnown: boolean
}

/**
 * The chart behind a disclosure. It mounts when first opened, so a folded chart is not measured while it
 * is hidden. Its summary names the action a press takes.
 */
function ByDuration({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  return (
    <details
      className="grade-profile__details"
      onToggle={(event) => {
        setOpen(event.currentTarget.open)
        if (event.currentTarget.open) setMounted(true)
      }}
    >
      <summary>{open ? 'Hide' : 'Show'} by duration</summary>
      {mounted && children}
    </details>
  )
}

/**
 * How the two sports' age grades compare from 3 min to 3 h, titled "Age grade by effort length". It is left out without the year of birth and sex, without a
 * weight, and with fewer than two durations graded in both sports, since a chart that would only repeat the
 * balance at 20 min says nothing more. The extra ride equivalents it needs are priced once for a result and
 * body mass, here, not in every combine. When no duration separates the sports the chart is folded;
 * otherwise it is open.
 */
export function GradeProfileSection({
  result,
  profile,
  massKg,
  weightKnown,
}: GradeProfileSectionProps) {
  // Memoised on the two profile values, not the object, which the caller builds afresh on each render.
  const birthYear = profile?.birthYear ?? null
  const sex = profile?.sex ?? null
  const graded = useMemo(
    () =>
      weightKnown && birthYear !== null && sex !== null
        ? gradeProfile(result, { birthYear, sex }, massKg)
        : null,
    [result, birthYear, sex, massKg, weightKnown],
  )
  if (graded === null || !profileComparable(graded)) return null
  const separated = profileSeparated(graded)
  return (
    <section className="balance__panel grade-profile" aria-labelledby="balance-profile">
      {/* The title is shown once: by the chart when it is open, else by this line over the folded chart. */}
      <h2 id="balance-profile" className="sr-only">
        {GRADE_PROFILE_TITLE}
      </h2>
      {separated ? (
        <GradeProfileChart profile={graded} />
      ) : (
        <>
          <p className="meta" aria-hidden="true">
            {GRADE_PROFILE_TITLE}
          </p>
          <ByDuration>
            <GradeProfileChart profile={graded} />
          </ByDuration>
        </>
      )}
    </section>
  )
}
