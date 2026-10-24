// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BalanceGap } from '../balanceGap'
import type { HeadlinePick } from '../components'
import type { Interval } from '@rca/core/types'
import { comparisonPoint, interval, makeActivity, makeResult } from '../components/fixtures'
import { BalanceHero } from './BalanceHero'

afterEach(() => {
  cleanup()
})

/** The props for the all-time period, which the balance copy names without a period. */
const ALL_TIME = { rangeDays: null, onShowAll: () => undefined, weightKnown: true }

function pickFor(ratio: Interval): HeadlinePick {
  return { point: comparisonPoint({ ratio }), calibrated: false }
}

function gradedGap(overrides: Partial<BalanceGap> = {}): BalanceGap {
  return { centre: 6, low: 2, high: 10, lean: 'run', ...overrides }
}

describe('BalanceHero answer on the energy ratio', () => {
  it('is the focusable page heading, titled with which way the balance leans', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult()}
        pick={pickFor(interval(1.05, 1.12, 1.2))}
        gap={null}
      />,
    )

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Your balance leans toward running',
    })
    expect(heading).toHaveAttribute('id', 'page-heading')
    expect(heading).toHaveAttribute('tabindex', '-1')
  })

  it('summarises the energy gap in one sentence under the heading', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult()}
        pick={pickFor(interval(1.05, 1.12, 1.2))}
        gap={null}
      />,
    )
    expect(
      screen.getByText(
        'Over 20 min, your running is about 12% higher than your cycling once both are put on the same energy scale.',
      ),
    ).toBeInTheDocument()
  })

  it('draws the energy gap as a meter named by the balance sentence', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult()}
        pick={pickFor(interval(1.05, 1.12, 1.2))}
        gap={null}
      />,
    )
    expect(
      screen.getByRole('img', { name: 'Running 12% higher on the energy scale (range 5% to 20%)' }),
    ).toBeInTheDocument()
  })

  it('titles the balance as leaning toward cycling when cycling leads', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult()}
        pick={pickFor(interval(0.75, 0.8, 0.9))}
        gap={null}
      />,
    )
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Your balance leans toward cycling',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Over 20 min, your cycling is about 25% higher than your running once both are put on the same energy scale.',
      ),
    ).toBeInTheDocument()
  })

  it('draws a cycling lead as positive percentages of cycling, with the range from the inverse', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult()}
        pick={pickFor(interval(0.75, 0.8, 0.9))}
        gap={null}
      />,
    )
    expect(
      screen.getByRole('img', {
        name: 'Cycling 25% higher on the energy scale (range 11% to 33%)',
      }),
    ).toBeInTheDocument()
  })

  it('says the two are in balance when the range spans 1', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult()}
        pick={pickFor(interval(0.95, 1, 1.05))}
        gap={null}
      />,
    )
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
      <BalanceHero
        {...ALL_TIME}
        result={makeResult()}
        pick={pickFor(interval(1.05, 1.12, 1.2))}
        gap={null}
      />,
    )
    expect(container.querySelector('.card')).toBeNull()
  })

  it('never states a categorical superiority such as the best sport or all-out efforts', () => {
    const { container } = render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult()}
        pick={pickFor(interval(0.75, 0.8, 0.9))}
        gap={null}
      />,
    )
    expect(container.textContent).not.toMatch(/best running|best cycling|all-out/)
  })
})

describe('BalanceHero on the age-grade gap', () => {
  it('titles the answer from the gap, and says the gap in points for the headline duration', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult()}
        pick={pickFor(interval(1.05, 1.12, 1.2))}
        gap={gradedGap()}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your balance leans toward running' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Your running grades 6 points higher than your cycling, on your best 20 minutes in each.',
      ),
    ).toBeInTheDocument()
  })

  it('draws the gap as the meter, named by the gap and its range', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult()}
        pick={pickFor(interval(1.05, 1.12, 1.2))}
        gap={gradedGap()}
      />,
    )
    expect(
      screen.getByRole('img', { name: /Running grades 6 points higher than cycling/ }),
    ).toHaveAccessibleName(/range 2 to 10 points/)
  })

  it('answers from the gap alone when there is no energy comparison yet', () => {
    render(<BalanceHero {...ALL_TIME} result={makeResult()} pick={null} gap={gradedGap()} />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your balance leans toward running' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Running grades 6 points/ })).toBeInTheDocument()
  })

  it('says the two are in balance, with the best estimate and the range that includes zero', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult()}
        pick={null}
        gap={gradedGap({ centre: 4, low: -2, high: 10, lean: 'even' })}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your running and cycling are in balance' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'On the age-grade best estimate, running grades 4 points higher, but the range (−2 to +10 points) includes zero, so the two are in balance.',
      ),
    ).toBeInTheDocument()
  })

  it('never says ahead of, limiter, weak or strength', () => {
    const { container } = render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult()}
        pick={null}
        gap={gradedGap({ lean: 'ride', centre: -6, low: -10, high: -2 })}
      />,
    )
    expect(container.textContent).not.toMatch(/ahead of|limiter|weak|strength/i)
  })
})

describe('BalanceHero without a comparison yet', () => {
  it('asks for a run and a ride when the files have neither', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult({ activities: [], comparison: { prior: [], calibrated: null } })}
        pick={null}
        gap={null}
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
        {...ALL_TIME}
        result={makeResult({
          activities: [makeActivity({ sport: 'run' })],
          comparison: { prior: [], calibrated: null },
        })}
        pick={null}
        gap={null}
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
        {...ALL_TIME}
        result={makeResult({
          activities: [makeActivity({ sport: 'ride' })],
          comparison: { prior: [], calibrated: null },
        })}
        pick={null}
        gap={null}
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
        {...ALL_TIME}
        result={makeResult({ comparison: { prior: [], calibrated: null } })}
        pick={null}
        gap={null}
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

describe('BalanceHero without a comparison yet, in a period', () => {
  it('names the period when it holds no runs, and offers all time', () => {
    const onShowAll = vi.fn()
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult({
          activities: [makeActivity({ sport: 'ride' })],
          comparison: { prior: [], calibrated: null },
        })}
        pick={null}
        gap={null}
        rangeDays={42}
        onShowAll={onShowAll}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'No runs in the last 6 weeks' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show all time' }))
    expect(onShowAll).toHaveBeenCalledTimes(1)
  })

  it('names the period when it holds neither sport', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult({ activities: [], comparison: { prior: [], calibrated: null } })}
        pick={null}
        gap={null}
        rangeDays={91}
        onShowAll={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'No runs or rides in the last 3 months' }),
    ).toBeInTheDocument()
  })

  it('asks for the sport with no period and offers no period button when the period is all time', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult({
          activities: [makeActivity({ sport: 'ride' })],
          comparison: { prior: [], calibrated: null },
        })}
        pick={null}
        gap={null}
        rangeDays={null}
        onShowAll={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Add runs to see your balance' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show all time' })).toBeNull()
  })
})

describe('BalanceHero while no weight is entered', () => {
  it('holds the balance and asks for the weight once both sports are on file', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult()}
        pick={pickFor(interval(1.05, 1.12, 1.2))}
        gap={gradedGap()}
        weightKnown={false}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your balance waits for your weight' }),
    ).toHaveAttribute('id', 'page-heading')
    expect(
      screen.getByText(
        (_, node) =>
          node?.tagName === 'P' &&
          node.textContent === 'Add your weight on Profile to compare a ride with a run.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('still names the missing ride when only runs are on file, since a ride is needed first', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult({
          activities: [makeActivity({ sport: 'run' })],
          comparison: { prior: [], calibrated: null },
        })}
        pick={null}
        gap={null}
        weightKnown={false}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Add rides to see your balance' }),
    ).toBeInTheDocument()
  })

  it('answers the balance once a weight is entered', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult()}
        pick={pickFor(interval(1.05, 1.12, 1.2))}
        gap={gradedGap()}
        weightKnown
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your balance leans toward running' }),
    ).toBeInTheDocument()
  })
})
