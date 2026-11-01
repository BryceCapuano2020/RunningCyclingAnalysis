import { createElement } from 'react'
import { FitnessYearsPanel } from './FitnessYearsPanel'
import type { HistorySection } from './types'

export const fitnessYears: HistorySection = {
  id: 'fitness-over-years',
  order: 60,
  render: ({ history, units }) =>
    createElement(FitnessYearsPanel, { fitness: history.fitness, units }),
}
