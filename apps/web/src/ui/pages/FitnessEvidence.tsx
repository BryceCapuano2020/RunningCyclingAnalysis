import type { ReactNode } from 'react'
import { FITNESS } from '@rca/core/fitness'
import type { FitnessStatus } from '@rca/core/fitness'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { UnitSystem } from '@rca/core/units'
import { FitnessChart } from '../charts/FitnessChart'
import { Definition } from '../components/Definition'
import { plural } from '../components/plural'
import { FITNESS_WORDS } from '../fitnessModel'
import { fitnessDefinitions } from '../fitnessText'
import { formatSpan } from '../format/date'
import { countSport } from '../records'
import { FitnessRuns } from './FitnessRuns'

const M = FITNESS.monitor
const U = FITNESS.unit

/**
 * How a level is measured, in a short paragraph with its terms defined where they first carry the answer, then
 * what it can and cannot see, said once. Rides read power from measured blocks, so they have their own words.
 */
function Method({ status }: { status: FitnessStatus }) {
  const meaning = fitnessDefinitions(status)
  const words = FITNESS_WORDS[status.sport]
  const hr = status.referenceHr
  const steady = <Definition meaning={meaning.steadyRun}>{words.steady}</Definition>
  const same = <Definition meaning={meaning.sameHeartRate}>{`${hr} bpm`}</Definition>
  const range = <Definition meaning={meaning.range}>90% range</Definition>
  const against = `${M.refStartWeeks - M.refEndWeeks} weeks before the last ${M.refEndWeeks}`
  return (
    <>
      <p>
        Each {steady} gives one figure: the {words.output.toLowerCase()} you ran at {same}, read
        from its kilometres and adjusted for the heart rate and the climb of each. Your level is the
        middle of your {words.steadyPlural} over the last 4 to 16 weeks. It is set against the level
        before the change began, the line across the chart, or against the {against} while nothing
        has changed. The band round each point is its {range}.
      </p>
      <p>
        It sees a change of about 5% or more, within weeks to a few months. A smaller change sits
        inside the run-to-run spread of about 4%, so it is not reported.
      </p>
    </>
  )
}

function Block({
  title,
  area,
  children,
}: {
  title: string
  area: 'method' | 'runs' | 'why'
  children: ReactNode
}) {
  return (
    <section className="fitness-evidence__block" data-area={area}>
      <h4 className="eyebrow">{title}</h4>
      {children}
    </section>
  )
}

export interface FitnessEvidenceProps {
  status: FitnessStatus
  units: UnitSystem
  /** Every activity in the library, which the runs behind the level are looked up in. */
  library: readonly ActivitySummary[]
}

/**
 * The panel behind "See the evidence": the level over time with its table, how it is measured, the runs it
 * rests on as links, and why some runs do not count. It mounts when opened, so a closed card costs nothing.
 */
export function FitnessEvidence({ status, units, library }: FitnessEvidenceProps) {
  const words = FITNESS_WORDS[status.sport]
  const evidence = status.evidence
  const onFile = countSport(library as ActivitySummary[], status.sport)
  const hr = status.referenceHr
  return (
    <div className="fitness-evidence">
      <FitnessChart status={status} units={units} />
      <div className="fitness-evidence__text">
        <Block title="How it is measured" area="method">
          <Method status={status} />
        </Block>
        {evidence === null || evidence.recent.runs === 0 ? null : (
          <Block title={`The ${words.steadyPlural} it rests on`} area="runs">
            <p className="secondary">
              {`${plural(evidence.recent.runs, words.steady)} behind your level now.`}
            </p>
            <FitnessRuns
              span={evidence.recent}
              library={library}
              units={units}
              noun={words.steady}
            />
            {evidence.baseline === null || evidence.baseline.runs === 0 ? null : (
              <p className="secondary">
                {`${plural(evidence.baseline.runs, words.steady)}, ${formatSpan(evidence.baseline.fromMs, evidence.baseline.toMs)}, are what it is compared with.`}
              </p>
            )}
          </Block>
        )}
        <Block title={`Why some ${words.activities} do not count`} area="why">
          <p>
            {`Of your ${plural(onFile, words.activity)} on file, ${status.steady} ${status.steady === 1 ? 'is a' : 'are'} ${status.steady === 1 ? words.steady : words.steadyPlural}. `}
            {status.sport === 'run'
              ? `The others were on a treadmill, had no heart rate or one that was set aside, changed pace from one kilometre to the next (intervals, tempo work, a race), or had too little flat running within ${U.hrHalfBand} bpm of ${hr} bpm.`
              : 'The others had no power meter, or too little riding near the reference heart rate.'}
          </p>
        </Block>
      </div>
    </div>
  )
}
