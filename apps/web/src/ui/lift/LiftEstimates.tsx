import type { UnitSystem } from '@rca/core/units'
import { PropertyList } from '../components/PropertyList'
import { SECTION_ID } from '../components/methodTopics'
import { DETAIL_TERM } from '../pages/ThresholdBasis'
import type { LiftOverview } from './liftEntries'
import { LiftChart } from './LiftChart'
import { WeeklyLoadChart } from './WeeklyLoadChart'

/**
 * The lifts with an estimate, one section each: the one-rep max over time with its 80% range, and the Details that say what
 * it rests on (the rows and the rep bests). Then the weekly load, apart from run and ride and never summed with their hours.
 */
export function LiftEstimates({ overview, units }: { overview: LiftOverview; units: UnitSystem }) {
  const { entries, others, weeks } = overview
  return (
    <>
      {entries.length > 0 && (
        <section className="section" aria-labelledby="lift-estimates">
          <div className="section__head">
            <h2 id="lift-estimates">One-rep max by lift</h2>
          </div>
          {entries.map((entry) => (
            <div key={entry.id} className="lift__estimate" data-lift={entry.id}>
              <h3 className="lift__name">{entry.title}</h3>
              <LiftChart title={entry.title} history={entry.history} units={units} />
              <details className="disclosure">
                <summary>
                  {DETAIL_TERM}
                  <span className="sr-only">{` for ${entry.title}`}</span>
                </summary>
                <div className="disclosure__body">
                  <PropertyList
                    rows={entry.rows}
                    method={SECTION_ID.lift}
                    methodName={`how the ${entry.title} one-rep max was worked out`}
                  />
                  {entry.bests.length > 0 && (
                    <>
                      <h4 className="lift__bests">Rep bests</h4>
                      <PropertyList rows={entry.bests} />
                    </>
                  )}
                </div>
              </details>
            </div>
          ))}
        </section>
      )}
      {others.length > 0 && (
        <section className="section" aria-labelledby="lift-others">
          <div className="section__head">
            <h2 id="lift-others">Other lifts</h2>
          </div>
          <PropertyList rows={others.map((entry) => entry.compact)} />
        </section>
      )}
      {weeks.length > 0 && (
        <section className="section" aria-labelledby="lift-load">
          <div className="section__head">
            <h2 id="lift-load">Weekly load</h2>
          </div>
          <WeeklyLoadChart weeks={weeks} units={units} />
        </section>
      )}
    </>
  )
}
