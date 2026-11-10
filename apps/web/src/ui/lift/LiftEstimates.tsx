import { useId, useState } from 'react'
import type { UnitSystem } from '@rca/core/units'
import { PropertyList } from '../components/PropertyList'
import { SECTION_ID } from '../components/methodTopics'
import { DETAIL_TERM } from '../pages/ThresholdBasis'
import { useScrollRegion } from '../useScrollRegion'
import type { LiftOverview } from './liftEntries'
import { LiftChart } from './LiftChart'
import { WeeklyLoadChart } from './WeeklyLoadChart'

/**
 * One lift's one-rep max over time with its 80% range, chosen from every lift with an estimate (the lift the page leads
 * with first), and the Details that say what it rests on. Then every lift in a table, and the weekly load, apart from run
 * and ride and never summed with their hours.
 */
export function LiftEstimates({ overview, units }: { overview: LiftOverview; units: UnitSystem }) {
  const { lifts, leadId, weeks } = overview
  const [chosen, setChosen] = useState<string | null>(null)
  const selectId = useId()
  const region = useScrollRegion('Every lift')
  const entry =
    lifts.find((lift) => lift.id === chosen) ?? lifts.find((lift) => lift.id === leadId) ?? lifts[0]
  const choose = (id: string) => {
    setChosen(id)
    document.getElementById(selectId)?.focus()
  }
  return (
    <>
      {entry !== undefined && (
        <section className="section" aria-labelledby="lift-estimates">
          <div className="section__head">
            <h2 id="lift-estimates">One-rep max by lift</h2>
          </div>
          <div className="lift__choose">
            <label htmlFor={selectId}>Lift shown</label>
            <select
              id={selectId}
              value={entry.id}
              onChange={(event) => setChosen(event.target.value)}
            >
              {lifts.map((lift) => (
                <option key={lift.id} value={lift.id}>
                  {lift.title}
                </option>
              ))}
            </select>
          </div>
          <div className="lift__estimate" data-lift={entry.id}>
            <h3 className="lift__name">{entry.title}</h3>
            {entry.history.length >= 2 ? (
              <LiftChart title={entry.title} history={entry.history} units={units} />
            ) : (
              <p className="lift__single">
                One session so far, {entry.table.last}. The line starts at the second.
              </p>
            )}
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
        </section>
      )}
      {lifts.length > 0 && (
        <section className="section" aria-labelledby="lift-all">
          <div className="section__head">
            <h2 id="lift-all">Your lifts</h2>
          </div>
          <div className="table-scroll" {...region}>
            <table className="lift-table">
              <caption className="sr-only">Every lift with its one-rep max</caption>
              <thead>
                <tr>
                  <th scope="col">Lift</th>
                  <th scope="col" className="num">
                    One-rep max
                  </th>
                  <th scope="col" className="num">
                    Heaviest set
                  </th>
                  <th scope="col" className="num">
                    Last session
                  </th>
                </tr>
              </thead>
              <tbody>
                {lifts.map((lift) => (
                  <tr key={lift.id}>
                    <th scope="row">
                      <button
                        type="button"
                        className="lift-table__pick"
                        aria-pressed={lift.id === entry?.id}
                        onClick={() => choose(lift.id)}
                      >
                        {lift.title}
                      </button>
                    </th>
                    <td className="num">{lift.table.max}</td>
                    <td className="num">{lift.table.heaviest}</td>
                    <td className="num">{lift.table.last}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
