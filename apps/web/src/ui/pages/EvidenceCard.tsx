import type { ReactNode } from 'react'
import type { EffortCheck } from '@rca/core/types'
import { effortCaveat, hardEffortsOnFile } from '../components/headlineText'
import { ArrowRightIcon, CheckIcon, WarningIcon } from '../components/icons'
import { hrefFor } from '../route'

export interface EvidenceCardProps {
  /** Heart-rate check for the headline duration, or null when it is unavailable. */
  effort: EffortCheck | null
}

interface Evidence {
  chip: { className: string; icon: ReactNode; label: string }
  title: string
  text: string
}

function evidenceFor(effort: EffortCheck | null): Evidence {
  const caveat = effortCaveat(effort)
  if (caveat) {
    return {
      chip: { className: 'chip chip--warning', icon: <WarningIcon />, label: 'Evidence gap' },
      title: caveat.title,
      text: caveat.text,
    }
  }
  if (hardEffortsOnFile(effort)) {
    return {
      chip: { className: 'chip chip--good', icon: <CheckIcon />, label: 'Hard efforts on file' },
      title: 'Built on real efforts',
      text: 'Heart rate shows your best efforts in both sports were hard ones, not easy days, so these numbers rest on real work.',
    }
  }
  return {
    chip: { className: 'chip', icon: <WarningIcon />, label: 'No heart-rate check' },
    title: 'Add heart rate to sharpen this',
    text: 'Files with heart rate show how hard your best efforts were, which narrows the range.',
  }
}

/**
 * Turns the heart-rate check into something to act on: an evidence gap says what to record, and
 * hard efforts on file say the numbers rest on real efforts. The detail is on How sure is this?
 */
export function EvidenceCard({ effort }: EvidenceCardProps) {
  const { chip, title, text } = evidenceFor(effort)
  return (
    <section className="card evidence-card" aria-labelledby="evidence-card">
      <span className={chip.className}>
        {chip.icon}
        {chip.label}
      </span>
      <h2 id="evidence-card">{title}</h2>
      <p className="secondary">{text}</p>
      <a className="link-arrow" href={hrefFor({ page: 'method' })}>
        How sure is this?
        <ArrowRightIcon />
      </a>
    </section>
  )
}
