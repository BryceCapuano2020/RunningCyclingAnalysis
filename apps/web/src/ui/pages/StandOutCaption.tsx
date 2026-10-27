import { useState } from 'react'
import { profileSentence, profileShortNote } from '@rca/core/profile'
import type { ReadyProfile } from '@rca/core/profile'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { StandOutChart } from '../charts'
import { profileOf } from '../durationProfile'
import { effortLabel } from '../records'

/** What the strip shows, as the disclosure names it: every best set against the others. */
const STRIP_NAME = 'each best against the others'

/** The strip of every best against the others, behind a disclosure that mounts it once opened. */
function StripDisclosure({ sport, profile }: { sport: Sport; profile: ReadyProfile }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  return (
    <details
      className="method__evidence"
      onToggle={(event) => {
        setOpen(event.currentTarget.open)
        if (event.currentTarget.open) setMounted(true)
      }}
    >
      <summary>{`${open ? 'Hide' : 'Show'} ${STRIP_NAME}`}</summary>
      {mounted && <StandOutChart sport={sport} rows={profile.rows} />}
    </details>
  )
}

/**
 * Where a sport's bests stand out from the rest of its own curve, as the caption of the curve above it.
 * It compares an athlete with their other bests and not with anyone else, and a best below the rest may
 * be untried, so the line says both. The strip behind it is offered only when something stands out.
 * Nothing while the bests cannot be compared; standOutLack says why.
 */
export function StandOutCaption({ sport, result }: { sport: Sport; result: AnalysisResult }) {
  const profile = profileOf(result, sport)
  if (profile.status !== 'ready') return null
  const shortNote = profileShortNote(profile, effortLabel)
  return (
    <>
      <p>{profileSentence(profile, effortLabel)}</p>
      {shortNote && <p className="muted">{shortNote}</p>}
      {profile.rows.some((row) => row.standsOut !== null) && (
        <StripDisclosure sport={sport} profile={profile} />
      )}
    </>
  )
}
