// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { levelOf } from '@rca/core/grade'
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

/** A ride's grade: an estimate, with the range its model gives, as the card shows it. */
const estimated = (grade: number, low: number, high: number): GradeOutcome => ({
  kind: 'graded',
  age: 37,
  grade: {
    centre: { grade, level: levelOf(grade) ?? 'Local' },
    range: {
      low: { grade: low, level: levelOf(low) ?? 'Local' },
      high: { grade: high, level: levelOf(high) ?? 'Local' },
    },
  },
})

describe('BalanceStrip', () => {
  it('puts both sports’ grades in one line, running first', () => {
    const { container } = render(
      <BalanceStrip
        grades={{ run: graded(0.6424, 'Local'), ride: graded(0.5801, 'Recreational') }}
      />,
    )
    expect(container.querySelector('.balance-strip')?.textContent).toBe(
      'Run 64% Local / Ride est. 58% Recreational',
    )
  })

  it('reads an estimated grade as an estimate, with its range and levels as the card has them', () => {
    const ride = estimated(0.5801, 0.5201, 0.6301)
    const { container } = render(<BalanceStrip grades={{ run: graded(0.6424, 'Local'), ride }} />)
    expect(container.querySelector('.balance-strip')?.textContent).toBe(
      'Run 64% Local / Ride est. 58% (52–63%) Recreational to Local',
    )
  })

  it('shows only the sport that is graded', () => {
    const { container } = render(
      <BalanceStrip grades={{ run: graded(0.6424, 'Local'), ride: null }} />,
    )
    expect(container.querySelector('.balance-strip')?.textContent).toBe('Run 64% Local')
  })

  it('keeps each sport’s name, estimate mark and figures in one unbroken span, so a phone never splits them', () => {
    const { container } = render(
      <BalanceStrip
        grades={{ run: graded(0.6424, 'Local'), ride: graded(0.5801, 'Recreational') }}
      />,
    )
    const sports = [...container.querySelectorAll<HTMLElement>('.balance-strip__sport')]
    expect(sports.map((sport) => sport.textContent)).toEqual(['Run 64%', 'Ride est. 58%'])
  })

  it('renders nothing when no grade is shown', () => {
    const { container } = render(
      <BalanceStrip grades={{ run: { kind: 'gap', reason: 'No best effort' }, ride: null }} />,
    )
    expect(container.querySelector('.balance-strip')).toBeNull()
  })
})
