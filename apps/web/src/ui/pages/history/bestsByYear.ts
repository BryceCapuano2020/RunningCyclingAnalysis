import { createElement } from 'react'
import { BestsByYearSection } from './BestsByYearSection'
import type { HistorySection } from './types'

export const bestsByYear: HistorySection = {
  id: 'bests-by-year',
  order: 50,
  render: ({ history, units }) =>
    createElement(BestsByYearSection, { bests: history.bests, units }),
}
