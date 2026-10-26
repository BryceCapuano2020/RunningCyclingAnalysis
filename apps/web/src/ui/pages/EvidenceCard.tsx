import type { ReactNode } from 'react'
import type { EffortCheck } from '@rca/core/types'
import { effortCaveat, hardEffortsOnFile } from '../components/headlineText'
import { ArrowRightIcon, CheckIcon, WarningIcon } from '../components/icons'
import { hrefFor } from '../route'

export interface EvidenceCardProps {
  /** Heart-rate check for the headline duration, or null when it is unavailable. */
  effort: EffortCheck | null
}

/**
 * What to do about a gap, in plain words. The check reads a best window as hard when its heart rate
 * reaches 90% of the highest sustained heart rate on file, so a hard, steady effort with heart rate
 * recorded is what narrows it.
 */
const RECORD_HARD_EFFORT =
  'To record one: after a warm-up, run or ride your hardest steady 20 minutes with heart rate on, then add the file.'
/** What to do when a file has no heart rate: the check cannot read effort without it. */
const ADD_HEART_RATE =
  'Wear a heart-rate strap or a watch that records heart rate, and export files that include it.'

interface Evidence {
  chip: { className: string; icon: ReactNode; label: string }
  title: string
  text: string
  /** The plain how-to for a card with something to act on; null for good news. */
  howTo: string | null
  /**
   * A gap has something to act on, so it is a card with its title as a heading. Good news is a
   * quiet line: a chip and a sentence, with no heading and no border.
   */
  boxed: boolean
}

function evidenceFor(effort: EffortCheck | null): Evidence {
  const caveat = effortCaveat(effort)
  if (caveat) {
    return {
      chip: { className: 'chip chip--warning', icon: <WarningIcon />, label: 'Could be higher' },
      title: caveat.title,
      text: caveat.text,
      howTo: RECORD_HARD_EFFORT,
      boxed: true,
    }
  }
  if (hardEffortsOnFile(effort)) {
    return {
      chip: { className: 'chip chip--good', icon: <CheckIcon />, label: 'Hard efforts on file' },
      title: 'Built on real efforts',
      text: 'Heart rate shows your best efforts in both sports were hard ones, not easy days. That makes them hard, but does not prove either was all-out.',
      howTo: null,
      boxed: false,
    }
  }
  return {
    chip: { className: 'chip', icon: <WarningIcon />, label: 'No heart-rate check' },
    title: 'Add heart rate to sharpen this',
    text: 'Files with heart rate show how hard your best efforts were, which narrows the range.',
    howTo: ADD_HEART_RATE,
    boxed: true,
  }
}

/**
 * Turns the heart-rate check into something to act on: an evidence gap says what to record, and
 * hard efforts on file are said plainly, in a quiet line. The detail is on How sure is this?
 */
export function EvidenceCard({ effort }: EvidenceCardProps) {
  const { chip, title, text, howTo, boxed } = evidenceFor(effort)
  const action = (
    <a className="link-arrow" href={hrefFor({ page: 'method' })}>
      How sure is this?
      <ArrowRightIcon />
    </a>
  )
  if (!boxed) {
    return (
      <section className="evidence-card evidence-card--quiet" aria-label={title}>
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
      {howTo && <p className="muted">{howTo}</p>}
      {action}
    </section>
  )
}
