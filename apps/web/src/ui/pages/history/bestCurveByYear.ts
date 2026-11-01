import { createElement } from 'react'
import { BestCurveByYearSection } from './BestCurveByYearSection'
import type { HistorySection } from './types'

export const bestCurveByYear: HistorySection = {
  id: 'best-curve-by-year',
  order: 55,
  render: ({ history, units }) =>
    createElement(BestCurveByYearSection, { curves: history.yearCurves, units }),
}
