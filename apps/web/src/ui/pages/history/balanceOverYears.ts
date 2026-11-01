import { createElement } from 'react'
import { BalanceOverYears } from '../BalanceOverYears'
import type { HistorySection } from './types'

export const balanceOverYears: HistorySection = {
  id: 'balance-over-years',
  order: 10,
  render: ({ history, grading }) =>
    createElement(BalanceOverYears, { years: history.balance, ...grading, placement: 'history' }),
}
