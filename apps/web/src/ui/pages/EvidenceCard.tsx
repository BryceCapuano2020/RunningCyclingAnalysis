import type { ReactNode } from 'react'
import type { EffortCheck } from '@rca/core/types'
import { effortCaveat, hardEffortsOnFile } from '../effortCaveat'
import { MethodSectionLink } from '../components/GradingLink'
import { ArrowRightIcon, CheckIcon, WarningIcon } from '../components/icons'
import { HEADLINE_LABEL } from '../grades'
import { effortLabel } from '../records'
import { hrefFor } from '../route'
import { TWENTY_MINUTE_ID } from './TwentyMinuteEffort'

export interface EvidenceCardProps {
  /** Heart-rate check for the headline duration, or null when there is no comparison to check. */
  effort: EffortCheck | null
  /**
   * True when the files have no heart rate, and only then the card asks for it. With heart rate on
   * file, the card reports a check it can make, and says nothing otherwise.
   */
  noHeartRate: boolean
}

/**
 * What to do about a gap, in plain words. The check reads a best window as hard when its heart rate
 * reaches 90% of the highest sustained heart rate on file, so a hard, steady effort with heart rate
 * recorded is what narrows it.
 */
const RECORD_HARD_EFFORT = `To record one: after a warm-up, run or ride your hardest steady ${HEADLINE_LABEL} with heart rate on, then add the file.`
/** What to do when a file has no heart rate: the check cannot read effort without it, and this says why. */
const ADD_HEART_RATE =
  'Heart rate shows how hard each best effort was. Wear a strap or a watch that records it, and export files that include it.'

interface Evidence {
  chip: { className: string; icon: ReactNode; label: string }
  /** The gap's heading. Null for good news, which is a quiet line with no heading. */
  title: string | null
  text: string
  /** The plain how-to for a card with something to act on; null for good news. */
  howTo: string | null
}

/** What the card says, or null when there is nothing to say: heart rate on file and no check to report. */
function evidenceFor(effort: EffortCheck | null, noHeartRate: boolean): Evidence | null {
  const caveat = effortCaveat(effort)
  if (caveat) {
    return {
      chip: { className: 'chip chip--warning', icon: <WarningIcon />, label: 'Could be higher' },
      title: caveat.title,
      text: caveat.text,
      howTo: RECORD_HARD_EFFORT,
    }
  }
  if (effort !== null && hardEffortsOnFile(effort)) {
    return {
      chip: { className: 'chip chip--good', icon: <CheckIcon />, label: 'Hard efforts on file' },
      title: null,
      text: `Heart rate shows your best ${effortLabel(effort.durationS)} in both sports were hard, not easy. Still, that does not prove either was your hardest.`,
      howTo: null,
    }
  }
  // Without heart rate on file, the card asks for it. With heart rate on file, a missing fraction says nothing.
  if (!noHeartRate) return null
  return {
    chip: { className: 'chip', icon: null, label: 'No heart-rate check' },
    title: 'Add heart rate to sharpen this',
    text: ADD_HEART_RATE,
    howTo: null,
  }
}

/**
 * Turns the heart-rate check into something to act on: an evidence gap says what to record, and
 * hard efforts on file are said plainly, in a quiet line. The detail is on How sure is this?
 */
export function EvidenceCard({ effort, noHeartRate }: EvidenceCardProps) {
  const evidence = evidenceFor(effort, noHeartRate)
  if (evidence === null) return null
  const { chip, title, text, howTo } = evidence
  const action = (
    <a className="link-arrow" href={hrefFor({ page: 'method' })}>
      How sure is this?
      <ArrowRightIcon />
    </a>
  )
  if (title === null) {
    return (
      <section className="evidence-card evidence-card--quiet" aria-label={chip.label}>
        <span className={chip.className}>
          {chip.icon}
          {chip.label}
        </span>
        <p className="secondary">{text}</p>
        {action}
      </section>
    )
  }
  return (
    <section className="card evidence-card" aria-labelledby="evidence-card">
      <span className={chip.className}>
        {chip.icon}
        {chip.label}
      </span>
      <h2 id="evidence-card">{title}</h2>
      <p className="secondary">{text}</p>
      {howTo && (
        <p className="muted">
          <span>{howTo}</span>{' '}
          <MethodSectionLink sectionId={TWENTY_MINUTE_ID}>
            How the 20 minute effort is checked
          </MethodSectionLink>
        </p>
      )}
      {action}
    </section>
  )
}
