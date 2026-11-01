import { createElement } from 'react'
import { HoursPerYearChart } from '../../charts/HoursPerYearChart'
import type { HistorySection } from './types'

export const hoursPerYear: HistorySection = {
  id: 'hours-per-year',
  order: 30,
  render: ({ history }) => createElement(HoursPerYearChart, { years: history.years }),
}
