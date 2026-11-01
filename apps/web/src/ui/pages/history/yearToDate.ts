import { createElement } from 'react'
import { YearToDateChart } from '../../charts/YearToDateChart'
import type { HistorySection } from './types'

export const yearToDate: HistorySection = {
  id: 'year-to-date',
  order: 30,
  render: ({ history, units }) =>
    createElement(YearToDateChart, { data: history.yearToDate, units }),
}
