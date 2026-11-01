import type { ReactNode } from 'react'
import type { History } from '@rca/core/history'
import type { UnitSystem } from '@rca/core/units'

/** What a section of the History page is given. A chart that needs more adds a field here, once. */
export interface HistorySectionProps {
  history: History
  units: UnitSystem
}

/** One chart of the History page. A section is one file, listed by one line in sections.ts. */
export interface HistorySection {
  /** Names the section; unique. */
  id: string
  /** Where it sits on the page, lowest first. Numbers go in tens, so one can be put between two. */
  order: number
  /** The section's content: a chart, made as an element so it keeps its own state. */
  render: (props: HistorySectionProps) => ReactNode
}
