import { useMemo } from 'react'
import { profileSentence, profileShortNote } from '@rca/core/profile'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { StandOutChart } from '../charts'
import { profileNeedsText, profileOf } from '../durationProfile'
import { effortLabel } from '../records'

export interface StandOutSectionProps {
  sport: Sport
  result: AnalysisResult
}

/**
 * Where a sport's bests stand out from the rest of its own curve. It compares an athlete with their other
 * bests and not with anyone else, and a best below the rest may be untried, so the line says both.
 */
export function StandOutSection({ sport, result }: StandOutSectionProps) {
  const profile = useMemo(() => profileOf(result, sport), [result, sport])
  const shortNote = profile.status === 'ready' ? profileShortNote(profile, effortLabel) : null
  return (
    <section className="section" aria-labelledby={`${sport}-stand-out`}>
      <h2 id={`${sport}-stand-out`}>Where your bests stand out</h2>
      {profile.status === 'ready' ? (
        <>
          <p>{profileSentence(profile, effortLabel)}</p>
          {shortNote && <p className="muted">{shortNote}</p>}
          <StandOutChart sport={sport} rows={profile.rows} />
        </>
      ) : (
        <p className="muted">{profileNeedsText(sport, profile.missing)}</p>
      )}
    </section>
  )
}
