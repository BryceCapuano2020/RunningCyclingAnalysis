import { createElement } from 'react'
import { IntensityByYearSection } from './IntensityByYearSection'
import type { HistorySection } from './types'

export const intensityByYear: HistorySection = {
  id: 'intensity-by-year',
  order: 70,
  render: ({ history }) => createElement(IntensityByYearSection, { years: history.intensity }),
}
