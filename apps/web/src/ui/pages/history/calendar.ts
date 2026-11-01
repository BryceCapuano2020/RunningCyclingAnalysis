import { createElement } from 'react'
import { TrainingCalendarChart } from '../../charts/TrainingCalendarChart'
import type { HistorySection } from './types'

export const calendar: HistorySection = {
  id: 'training-calendar',
  order: 20,
  render: ({ history }) =>
    createElement(TrainingCalendarChart, { calendar: history.calendar, years: history.years }),
}
