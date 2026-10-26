// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { GradeOutcome } from '../grades'
import { BalanceStrip } from './BalanceStrip'

afterEach(() => {
  cleanup()
})

const graded = (grade: number, level: string): GradeOutcome => ({
  kind: 'graded',
  age: 37,
  grade: { centre: { grade, level }, range: null },
})

describe('BalanceStrip', () => {
  it('puts both sports’ grades in one line, running first', () => {
    const { container } = render(
      <BalanceStrip
        grades={{ run: graded(0.6424, 'Local'), ride: graded(0.5801, 'Recreational') }}
      />,
    )
    expect(container.querySelector('.balance-strip')?.textContent).toBe(
      'Run 64% Local / Ride 58% Recreational',
    )
  })

  it('shows only the sport that is graded', () => {
    const { container } = render(
      <BalanceStrip grades={{ run: graded(0.6424, 'Local'), ride: null }} />,
    )
    expect(container.querySelector('.balance-strip')?.textContent).toBe('Run 64% Local')
  })

  it('keeps each sport’s grade in its own unbroken span, so a phone never splits one', () => {
    const { container } = render(
      <BalanceStrip
        grades={{ run: graded(0.6424, 'Local'), ride: graded(0.5801, 'Recreational') }}
      />,
    )
    const sports = [...container.querySelectorAll<HTMLElement>('.balance-strip__sport')]
    expect(sports.map((sport) => sport.textContent)).toEqual([
      'Run 64% Local',
      'Ride 58% Recreational',
    ])
  })

  it('renders nothing when no grade is shown', () => {
    const { container } = render(
      <BalanceStrip grades={{ run: { kind: 'gap', reason: 'No best effort' }, ride: null }} />,
    )
    expect(container.querySelector('.balance-strip')).toBeNull()
  })
})
