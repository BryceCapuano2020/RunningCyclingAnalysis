import { useId, useState } from 'react'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { UnitSystem } from '@rca/core/units'
import { NumText } from '../components/NumText'
import { RowIndex } from '../components/RowList'
import { useHoldInputs } from '../holdContext'
import { SPORT_LABEL } from '../sports'
import { adjustedForWarmDays } from '../fitnessModel'
import type { FitnessView } from '../fitnessModel'
import { fitnessRows } from '../fitnessRows'
import { SECTION_ID } from '../components/methodTopics'
import { PropertyList } from '../components/PropertyList'
import { FitnessEvidence } from './FitnessEvidence'
import { fitnessLine } from '../fitnessLine'
import './FitnessCard.css'

export interface FitnessCardProps {
  view: FitnessView
  units: UnitSystem
  library: readonly ActivitySummary[]
  /** The row's place in the list, which its index shows. Null in a list of one row, which is not numbered. */
  index?: number | null
  /**
   * A sport that cannot call a trend yet on the home page: where it has no level to tell, `text` is its one line (why
   * there is none, with the library's counts).
   */
  bare?: { text: string | null }
  /**
   * Whether the Details hold the level's graph. Only a sport's own page draws it; Balance's Details hold the figures
   * and the runs alone.
   */
  graphs?: boolean
  /** False on Balance: the steady runs and what they are compared with are on the sport's own page, not in this card. */
  evidence?: boolean
}

/**
 * One sport's fitness at the same effort as a numbered row (docs/design/system.md, Rows): the sport as the title, its
 * level as the one line under it, and one ▸ Details that holds the rest in order: the level with its range, what it rests
 * on, how old it is, what a trend needs, and the evidence, which mounts once the Details opens.
 */
export function FitnessCard({
  view,
  units,
  library,
  index = 0,
  bare,
  graphs = false,
  evidence = true,
}: FitnessCardProps) {
  const id = useId()
  const [mounted, setMounted] = useState(false)
  const partial = useHoldInputs().partialImport
  const { status } = view
  // A row with no index has no index column.
  const rowClass = index === null ? 'row row--unnumbered fitness-card' : 'row fitness-card'
  // Held with the headline: a library known to be only part of what was added gives no state to show.
  if (partial !== undefined && partial !== null) {
    return (
      <li className={rowClass} data-sport={view.sport} data-state="held">
        {index === null ? null : <RowIndex index={index} />}
        <div className="row__body">
          <h3 id={`${id}-state`} className="row__title fitness-card__state">
            {SPORT_LABEL[view.sport]}
          </h3>
          <p className="row__line" data-testid="fitness-held">
            {`${partial.text} ${partial.action}`}
          </p>
        </div>
      </li>
    )
  }
  const waiting = view.state === 'not-enough-evidence'
  const warm = !waiting && adjustedForWarmDays(status)
  const evidenceOf =
    evidence && !waiting && view.status.evidence !== null && view.status.series.length > 1
  const line = bare?.text ?? fitnessLine(view)
  // The level is in Details with its range whenever the line dropped a range from it.
  const levelInDetails = bare?.text == null && line !== view.headline
  const rows = fitnessRows(view, units, { level: levelInDetails, warm })
  const hasDetails = rows.length > 0 || evidenceOf
  return (
    <li className={rowClass} data-sport={view.sport} data-state={view.state}>
      {index === null ? null : <RowIndex index={index} />}
      <div className="row__body">
        <h3 id={`${id}-state`} className="row__title fitness-card__state">
          {SPORT_LABEL[view.sport]}
        </h3>
        <p className="row__line fitness-card__line" data-testid="fitness-line">
          <NumText text={line} />
        </p>
        {!hasDetails ? null : (
          <details
            className="disclosure fitness-card__evidence"
            onToggle={(event) => {
              if (event.currentTarget.open) setMounted(true)
            }}
          >
            <summary>
              Details
              {/* Two rows on Balance: a control list needs to tell them apart. */}
              <span className="sr-only">{` for ${SPORT_LABEL[view.sport].toLowerCase()}`}</span>
            </summary>
            <div className="disclosure__body fitness-card__details">
              <PropertyList
                rows={rows}
                method={SECTION_ID.how}
                methodName={`how ${SPORT_LABEL[view.sport].toLowerCase()} fitness is worked out`}
              />
              {evidenceOf && mounted ? (
                <FitnessEvidence status={status} units={units} library={library} chart={graphs} />
              ) : null}
            </div>
          </details>
        )}
      </div>
    </li>
  )
}
