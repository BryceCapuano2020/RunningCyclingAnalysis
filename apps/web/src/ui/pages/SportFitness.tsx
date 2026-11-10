import { useId, useMemo, useState } from 'react'
import type { FitnessBySport } from '@rca/core/fitness'
import type { FitnessDots } from '@rca/core/history'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { FitnessChart } from '../charts/FitnessChart'
import { FitnessYearsChart } from '../charts/FitnessYearsChart'
import { SECTION_ID } from '../components/methodTopics'
import { PropertyList } from '../components/PropertyList'
import { useHoldInputs } from '../holdContext'
import { adjustedForWarmDays, fitnessViews } from '../fitnessModel'
import type { FitnessView } from '../fitnessModel'
import { fitnessLine } from '../fitnessLine'
import { fitnessRows } from '../fitnessRows'
import { SPORT_LABEL } from '../sports'
import { FitnessEvidence } from './FitnessEvidence'
import { FitnessSection } from './FitnessSection'
import { FitnessTrack } from './FitnessTrack'
import './FitnessCard.css'
import './FitnessSection.css'

export interface SportFitnessProps {
  fitness: FitnessBySport
  /** The sport's steady activities over the whole library: what a status with no trend yet is drawn from. */
  dots?: FitnessDots
  units: UnitSystem
  library: readonly ActivitySummary[]
  sport: Sport
  /** Today, given by tests; see FitnessSection. */
  nowMs?: number
}

/** The fewest dots a graph of a status with no trend is worth drawing from: the same three a level is. */
const MIN_DOTS = 3

/** Whether the status has a level over time to draw: two steps and the level they are read against. */
const hasSeries = (view: FitnessView) =>
  view.state !== 'not-enough-evidence' &&
  view.status.series.length > 1 &&
  view.status.before !== null

/**
 * A sport page's "Your fitness" as a graph: the level over time titled by its state, with today and a recovery's low
 * marked, or, for a status with no trend yet, the steady activities it rests on as dots with today's level across them.
 * The status's sentence is the graph's text, and the rest (the level's range, what it rests on, the runs) stays behind
 * ▸ Details. A sport with nothing to draw keeps the section's one line. The Balance page's card is not this one.
 */
export function SportFitness({ fitness, dots, units, library, sport, nowMs }: SportFitnessProps) {
  const id = useId()
  const [openedAt] = useState(() => Date.now())
  const [mounted, setMounted] = useState(false)
  const partial = useHoldInputs().partialImport
  const today = nowMs ?? openedAt
  const view = useMemo(
    () => fitnessViews(fitness, units, today).find((v) => v.sport === sport),
    [fitness, units, sport, today],
  )
  const drawn = dots !== undefined && dots.levels.length >= MIN_DOTS
  const held = partial !== undefined && partial !== null
  if (view === undefined || held || !(drawn || hasSeries(view))) {
    return (
      <FitnessSection
        fitness={fitness}
        units={units}
        library={library}
        sport={sport}
        nowMs={nowMs}
        graphs
      />
    )
  }
  const { status } = view
  const sentence = fitnessLine(view)
  const rows = fitnessRows(view, units, { level: true, warm: adjustedForWarmDays(status) })
  const evidenceOf = status.evidence !== null && status.series.length > 1
  // The section's one Details is the chart's: its sentence and table, then the level's rows, the track and the runs.
  const details = (
    <div className="fitness-card__details">
      <PropertyList
        rows={rows}
        method={SECTION_ID.how}
        methodName={`how ${SPORT_LABEL[sport].toLowerCase()} fitness is worked out`}
      />
      {view.track === null ? null : (
        <div className="fitness-card__shape">
          <FitnessTrack track={view.track} />
        </div>
      )}
      {evidenceOf && mounted ? (
        <FitnessEvidence status={status} units={units} library={library} chart={false} />
      ) : null}
    </div>
  )
  const open = () => setMounted(true)
  return (
    <section
      className="band fitness-section"
      aria-labelledby={id}
      data-testid="fitness-section"
      data-state={view.state}
    >
      <h2 id={id}>Your fitness</h2>
      {hasSeries(view) ? (
        <FitnessChart
          status={status}
          units={units}
          title={view.label}
          lede={sentence}
          extra={details}
          onOpen={open}
        />
      ) : (
        <FitnessYearsChart
          sport={sport}
          dots={dots!}
          units={units}
          title={view.label}
          lede={sentence}
          now={status.level?.value ?? status.now}
          showSpans={false}
          compact
          extra={details}
          onOpen={open}
        />
      )}
    </section>
  )
}
