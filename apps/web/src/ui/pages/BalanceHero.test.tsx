// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Period } from '@rca/core/period'
import type { BalanceGap } from '../balanceGap'
import type { HeadlinePick } from '../components'
import type { Interval } from '@rca/core/types'
import { comparisonPoint, interval, makeActivity, makeResult } from '../components/fixtures'
import { BalanceHero } from './BalanceHero'

afterEach(() => {
  cleanup()
})

const ALL_TIME_PERIOD: Period = {
  choice: 'all',
  startMs: null,
  endMs: null,
  days: null,
  fellBack: false,
}
/** A six-week period from 12 May to 3 August 2025, dated in the viewer's zone. */
const SIX_WEEKS: Period = {
  choice: 42,
  startMs: new Date(2025, 4, 12, 12).getTime(),
  endMs: new Date(2025, 7, 3, 12).getTime(),
  days: 42,
  fellBack: false,
}

/** The props shared by every test: all time, with no library, unless a test says otherwise. */
const ALL_TIME = {
  period: ALL_TIME_PERIOD,
  library: [],
  onShowAll: () => undefined,
  weightKnown: true,
}

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
        'Your running grades 6 points higher than your cycling, on your best 20 min in each.',
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

  it('answers with the run level when the run is graded, and asks for a ride', () => {
    const run = makeActivity({ sport: 'run' })
    render(
      <BalanceHero
        {...ALL_TIME}
        library={[run]}
        runLevel="Local"
        result={makeResult({ activities: [run], comparison: { prior: [], calibrated: null } })}
        pick={null}
        gap={null}
      />,
    )
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Your running is at Local level. Add a ride to see your balance.',
      }),
    ).toBeInTheDocument()
  })

  it('asks for a ride when only runs are present, and points down to the running', () => {
    const run = makeActivity({ sport: 'run' })
    render(
      <BalanceHero
        {...ALL_TIME}
        library={[run]}
        result={makeResult({ activities: [run], comparison: { prior: [], calibrated: null } })}
        pick={null}
        gap={null}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Add a ride to see your balance' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Your running is below.')).toBeInTheDocument()
  })

  it('asks for a run when only rides are present, and points down to the cycling', () => {
    const ride = makeActivity({ sport: 'ride' })
    render(
      <BalanceHero
        {...ALL_TIME}
        library={[ride]}
        result={makeResult({ activities: [ride], comparison: { prior: [], calibrated: null } })}
        pick={null}
        gap={null}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Add a run to see your balance' }),
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

  it('sets the aside beside the headline, so the share buttons sit with the answer', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        aside={<button type="button">Download square image</button>}
        result={makeResult({ activities: [], comparison: { prior: [], calibrated: null } })}
        pick={null}
        gap={null}
      />,
    )
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.parentElement).toHaveClass('balance-hero__head')
    expect(heading.parentElement).toContainElement(
      screen.getByRole('button', { name: 'Download square image' }),
    )
  })
})

describe('BalanceHero without a comparison yet, in a period', () => {
  it('names the dates when the period holds no runs, counts the runs in All time, and offers all time', () => {
    const onShowAll = vi.fn()
    const ride = makeActivity({ id: 'ride-1', sport: 'ride' })
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    render(
      <BalanceHero
        {...ALL_TIME}
        period={SIX_WEEKS}
        library={[ride, run]}
        result={makeResult({ activities: [ride], comparison: { prior: [], calibrated: null } })}
        pick={null}
        gap={null}
        onShowAll={onShowAll}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'No runs between 12 May and 3 Aug 2025' }),
    ).toBeInTheDocument()
    expect(screen.getByText('You have 1 run in All time.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show all time' }))
    expect(onShowAll).toHaveBeenCalledTimes(1)
  })

  it('names the dates when the period holds neither sport, and counts both in All time', () => {
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    const ride = makeActivity({ id: 'ride-1', sport: 'ride' })
    render(
      <BalanceHero
        {...ALL_TIME}
        period={SIX_WEEKS}
        library={[run, ride]}
        result={makeResult({ activities: [], comparison: { prior: [], calibrated: null } })}
        pick={null}
        gap={null}
      />,
    )
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'No runs or rides between 12 May and 3 Aug 2025',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('You have 1 run and 1 ride in All time.')).toBeInTheDocument()
  })

  it('asks for the sport with no period and offers no period button when the period is all time', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        library={[makeActivity({ sport: 'ride' })]}
        result={makeResult({
          activities: [makeActivity({ sport: 'ride' })],
          comparison: { prior: [], calibrated: null },
        })}
        pick={null}
        gap={null}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Add a run to see your balance' }),
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
    const run = makeActivity({ sport: 'run' })
    render(
      <BalanceHero
        {...ALL_TIME}
        library={[run]}
        result={makeResult({
          activities: [run],
          comparison: { prior: [], calibrated: null },
        })}
        pick={null}
        gap={null}
        weightKnown={false}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Add a ride to see your balance' }),
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
