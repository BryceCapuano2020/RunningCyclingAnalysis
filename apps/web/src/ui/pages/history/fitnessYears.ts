import { createElement } from 'react'
import { FitnessYearsSection } from './FitnessYearsSection'
import type { HistorySection } from './types'

export const fitnessYears: HistorySection = {
  id: 'fitness-over-years',
  order: 65,
  render: ({ history, units }) =>
    createElement(FitnessYearsSection, { fitness: history.fitness, units }),
}
