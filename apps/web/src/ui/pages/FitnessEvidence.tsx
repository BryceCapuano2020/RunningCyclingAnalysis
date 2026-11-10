import type { FitnessStatus } from '@rca/core/fitness'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { UnitSystem } from '@rca/core/units'
import { FitnessChart } from '../charts/FitnessChart'
import { plural } from '../components/plural'
import { PropertyList } from '../components/PropertyList'
import type { Property } from '../components/property'
import { FITNESS_WORDS } from '../fitnessWords'
import { formatSpan } from '../format/date'
import { countSport } from '../records'
import { seasonSwing } from '../fitnessModel'
import { FitnessRuns } from './FitnessRuns'
import './FitnessEvidence.css'

/** A row's label starts with a capital: "Runs on file". */
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export interface FitnessEvidenceProps {
  status: FitnessStatus
  units: UnitSystem
  /** Every activity in the library, which the runs behind the level are looked up in. */
  library: readonly ActivitySummary[]
  /** False where the level's chart is already on the page, as on a sport's own page. */
  chart?: boolean
}

/**
 * The panel behind "See the evidence": the level over time with its table, what it is read at and compared with as rows, and
 * the steady runs used, as links. How it is measured is on Method, linked once above this panel. It mounts when opened, so a closed card costs nothing.
 */
export function FitnessEvidence({ status, units, library, chart = true }: FitnessEvidenceProps) {
  const words = FITNESS_WORDS[status.sport]
  const evidence = status.evidence
  const onFile = countSport(library as ActivitySummary[], status.sport)
  const swing = seasonSwing(status)
  const rows: Property[] = [
    { label: 'Read at', value: `${status.referenceHr} bpm` },
    { label: `${cap(words.activities)} on file`, value: String(onFile) },
    { label: `${cap(words.steadyPlural)} on file`, value: String(status.steady) },
    ...(evidence?.baseline == null || evidence.baseline.runs === 0
      ? []
      : [
          {
            label: 'Compared with',
            value: `${plural(evidence.baseline.runs, words.steady)}, ${formatSpan(evidence.baseline.fromMs, evidence.baseline.toMs)}`,
          },
        ]),
    ...(swing === null ? [] : [{ label: 'Seasonal swing taken out', value: swing }]),
  ]
  return (
    <div className="fitness-evidence">
      {chart ? <FitnessChart status={status} units={units} /> : null}
      <div className="fitness-evidence__text">
        <PropertyList rows={rows} />
        {evidence === null || evidence.recent.runs === 0 ? null : (
          <section className="fitness-evidence__block" data-area="runs">
            <h2 className="eyebrow">{`${cap(words.steadyPlural)} used`}</h2>
            <FitnessRuns
              span={evidence.recent}
              library={library}
              units={units}
              noun={words.steady}
            />
          </section>
        )}
      </div>
    </div>
  )
}
