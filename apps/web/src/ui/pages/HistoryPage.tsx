import type { History } from '@rca/core/history'
import type { UnitSystem } from '@rca/core/units'
import { summaryOf } from '../historySummary'
import { listedSections } from './history/sectionList'
import type { GradingInputs } from './history/types'
import { HistorySummary } from './HistorySummary'
import './HistoryPage.css'
import { PageHeading } from '../components/PageHeading'

export interface HistoryPageProps {
  /** The whole library's history, whatever period is picked. */
  history: History
  units: UnitSystem
  /** The athlete's profile for the charts that grade. */
  grading: GradingInputs
}

const EMPTY_TEXT = 'Add runs or rides to see your history.'

/** The athlete's whole library, year by year: numbered rows of totals, then one chart for each section. */
export function HistoryPage({ history, units, grading }: HistoryPageProps) {
  const stats = summaryOf(history.years, units)
  return (
    <div className="page-stack history">
      <div className="page-title">
        <PageHeading>History</PageHeading>
        {stats.length === 0 && <p className="secondary">{EMPTY_TEXT}</p>}
      </div>
      {stats.length > 0 && (
        <>
          <HistorySummary stats={stats} />
          {listedSections().map(({ id, render }) => (
            <div key={id} className="section" data-section={id}>
              {render({ history, units, grading })}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
