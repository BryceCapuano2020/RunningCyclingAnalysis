import type { History } from '@rca/core/history'
import type { LookBack } from '@rca/core/lookback'
import type { UnitSystem } from '@rca/core/units'
import { summaryOf } from '../historySummary'
import { listedSections } from './history/sectionList'
import type { GradingInputs } from './history/types'
import { HistorySummary } from './HistorySummary'
import { PAGE_HEADING_ID } from './pageHeading'
import './HistoryPage.css'

export interface HistoryPageProps {
  /** The whole library's history, whatever period is picked. */
  history: History
  units: UnitSystem
  /** The athlete's profile for the charts that grade. */
  grading: GradingInputs
  /** The look-back, whose episodes the fitness chart lists. */
  lookBack: LookBack
}

const EMPTY_TEXT = 'Add runs or rides to see your history.'

/** The athlete's whole library, year by year: numbered rows of totals, then one chart for each section. */
export function HistoryPage({ history, units, grading, lookBack }: HistoryPageProps) {
  const stats = summaryOf(history.years, units)
  return (
    <div className="page-stack history">
      <div className="page-title">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
          History
        </h1>
        {stats.length === 0 && <p className="secondary">{EMPTY_TEXT}</p>}
      </div>
      {stats.length > 0 && (
        <>
          <HistorySummary stats={stats} years={history.years} />
          {listedSections().map(({ id, render }) => (
            <div key={id} className="section" data-section={id}>
              {render({ history, units, grading, lookBack })}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
