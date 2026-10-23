// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { HeadlinePick } from '../components'
import type { Interval } from '@rca/core/types'
import { comparisonPoint, interval, makeActivity, makeResult } from '../components/fixtures'
import { BalanceHero } from './BalanceHero'

afterEach(() => {
  cleanup()
})

function pickFor(ratio: Interval): HeadlinePick {
  return { point: comparisonPoint({ ratio }), calibrated: false }
}

describe('BalanceHero answer', () => {
  it('is the focusable page heading, titled with which way the balance leans', () => {
    render(<BalanceHero result={makeResult()} pick={pickFor(interval(1.05, 1.12, 1.2))} />)

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Your balance leans toward running',
    })
    expect(heading).toHaveAttribute('id', 'page-heading')
    expect(heading).toHaveAttribute('tabindex', '-1')
  })

  it('summarises the gap in one sentence under the heading', () => {
    render(<BalanceHero result={makeResult()} pick={pickFor(interval(1.05, 1.12, 1.2))} />)
    expect(
      screen.getByText(
        'Over 20 min, your running is about 12% ahead of your cycling once both are put on the same energy scale.',
      ),
    ).toBeInTheDocument()
  })

  it('draws the gap as a meter named by the balance sentence', () => {
    render(<BalanceHero result={makeResult()} pick={pickFor(interval(1.05, 1.12, 1.2))} />)
    expect(
      screen.getByRole('img', { name: 'Running ahead by 12% (range 5% to 20%)' }),
    ).toBeInTheDocument()
  })

  it('titles the balance as leaning toward cycling when cycling leads', () => {
    render(<BalanceHero result={makeResult()} pick={pickFor(interval(0.75, 0.8, 0.9))} />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Your balance leans toward cycling',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Over 20 min, your cycling is about 25% ahead of your running once both are put on the same energy scale.',
      ),
    ).toBeInTheDocument()
  })

  it('draws a cycling lead as positive percentages of cycling, with the range from the inverse', () => {
    render(<BalanceHero result={makeResult()} pick={pickFor(interval(0.75, 0.8, 0.9))} />)
    expect(
      screen.getByRole('img', { name: 'Cycling ahead by 25% (range 11% to 33%)' }),
    ).toBeInTheDocument()
  })

  it('says the two are in balance when the range spans 1', () => {
    render(<BalanceHero result={makeResult()} pick={pickFor(interval(0.95, 1, 1.05))} />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Your running and cycling are in balance',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('img', {
        name: "Even within the model's range (running against cycling -5% to +5%)",
      }),
    ).toBeInTheDocument()
  })

  it('draws no card of its own, since the page supplies the card', () => {
    const { container } = render(
      <BalanceHero result={makeResult()} pick={pickFor(interval(1.05, 1.12, 1.2))} />,
    )
    expect(container.querySelector('.card')).toBeNull()
  })

  it('never states a categorical superiority such as the best sport or all-out efforts', () => {
    const { container } = render(
      <BalanceHero result={makeResult()} pick={pickFor(interval(0.75, 0.8, 0.9))} />,
    )
    expect(container.textContent).not.toMatch(/best running|best cycling|all-out/)
  })
})

describe('BalanceHero without a comparison yet', () => {
  it('asks for a run and a ride when the files have neither', () => {
    render(
      <BalanceHero
        result={makeResult({ activities: [], comparison: { prior: [], calibrated: null } })}
        pick={null}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Add a run and a ride to see your balance' }),
    ).toHaveAttribute('id', 'page-heading')
    expect(
      screen.getByText('Your files have no running or cycling activities yet.'),
    ).toBeInTheDocument()
  })

  it('asks for rides when only runs are present, and points down to the running', () => {
    render(
      <BalanceHero
        result={makeResult({
          activities: [makeActivity({ sport: 'run' })],
          comparison: { prior: [], calibrated: null },
        })}
        pick={null}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Add rides to see your balance' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Your running is below.')).toBeInTheDocument()
  })

  it('asks for runs when only rides are present, and points down to the cycling', () => {
    render(
      <BalanceHero
        result={makeResult({
          activities: [makeActivity({ sport: 'ride' })],
          comparison: { prior: [], calibrated: null },
        })}
        pick={null}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Add runs to see your balance' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Your cycling is below.')).toBeInTheDocument()
  })

  it('says the efforts must be harder when both sports are present but cannot be compared', () => {
    render(
      <BalanceHero
        result={makeResult({ comparison: { prior: [], calibrated: null } })}
        pick={null}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your balance needs harder efforts' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Both sports are in your files, but no efforts of the same length could be compared yet.',
      ),
    ).toBeInTheDocument()
  })
})
