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
        'Over 20 min, your running is 12% higher than your cycling, within 5% to 20%, as energy per kilogram.',
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
      screen.getByRole('img', {
        name: 'Running 12% higher, as energy per kilogram (range 5% to 20%)',
      }),
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
        'Over 20 min, your cycling is 25% higher than your running, within 11% to 33%, as energy per kilogram.',
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
        name: 'Cycling 25% higher, as energy per kilogram (range 11% to 33%)',
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

describe('BalanceHero level line', () => {
  const LINE =
    'To grade level with your running at 20 min, your best ride would need about 285 W (now 230 W).'

  it('sets the level line under the meter, muted, when one is given', () => {
    const { container } = render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult()}
        pick={pickFor(interval(1.05, 1.12, 1.2))}
        gap={gradedGap()}
        levelLine={LINE}
      />,
    )
    const line = screen.getByText(LINE)
    expect(line.tagName).toBe('P')
    expect(line).toHaveClass('muted')
    expect(line.parentElement).toHaveClass('balance-hero__meter')
    expect(container.querySelector('.balance-hero__level')).toBe(line)
  })

  it('shows no level line when none is given, as when the balance is even', () => {
    const { container } = render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult()}
        pick={pickFor(interval(1.05, 1.12, 1.2))}
        gap={gradedGap()}
      />,
    )
    expect(container.querySelector('.balance-hero__level')).toBeNull()
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
        'Running’s age grade is 6 points higher than cycling’s at 20 min, within 2 to 10 points.',
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
    ).toHaveAccessibleName(/range 2 to 10\u00a0points/)
  })

  it('answers from the gap, not the energy ratio, when both are there', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult()}
        pick={pickFor(interval(0.75, 0.8, 0.9))}
        gap={gradedGap()}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your balance leans toward running' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Running grades 6 points/ })).toBeInTheDocument()
  })

  it('holds the answer, gap and all, while nothing picks a headline comparison', () => {
    render(<BalanceHero {...ALL_TIME} result={makeResult()} pick={null} gap={gradedGap()} />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Not enough to compare yet' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Running grades/ })).toBeNull()
  })

  it('leans on a 9 point estimate whose range reaches below zero, with the range stated and no word of balance', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult()}
        pick={pickFor(interval(1.05, 1.12, 1.2))}
        gap={gradedGap({ centre: 9, low: -4, high: 18, lean: 'run' })}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your balance leans toward running' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Running’s age grade is 9 points higher than cycling’s at 20 min, within −4 to +18 points.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/in balance|level/)).toBeNull()
    expect(screen.getByRole('img', { name: /Running grades 9 points/ })).toHaveAccessibleName(
      /range −4 to \+18\u00a0points/,
    )
  })

  it('says the two are in balance in the title, and gives the best estimate and its range under it', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult()}
        pick={pickFor(interval(1.05, 1.12, 1.2))}
        gap={gradedGap({ centre: 2, low: -2, high: 6, lean: 'even' })}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your running and cycling are in balance' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Running’s age grade is 2 points higher than cycling’s at 20 min, within −2 to +6 points, so the two are level.',
      ),
    ).toBeInTheDocument()
  })

  it('never says ahead of, limiter, weak or strength', () => {
    const { container } = render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult()}
        pick={pickFor(interval(1.05, 1.12, 1.2))}
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
    expect(screen.getByText('Your run results are below.')).toBeInTheDocument()
  })

  it('leaves the file chooser to the empty sport card, so the answer offers none', () => {
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
    expect(screen.queryByRole('button', { name: 'Add rides' })).not.toBeInTheDocument()
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
    expect(screen.getByText('Your ride results are below.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add runs' })).not.toBeInTheDocument()
  })

  it('says there is not enough to compare yet, and what each sport needs, from the runs and rides on file', () => {
    const run = makeActivity({ id: 'run-1', sport: 'run' })
    const rides = [1, 2].map((n) => makeActivity({ id: `ride-${n}`, sport: 'ride' }))
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult({
          activities: [run, ...rides],
          comparison: { prior: [], calibrated: null },
        })}
        pick={null}
        gap={null}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Not enough to compare yet' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('From 1 run and 2 rides. Needs 2 more runs and 1 more ride.'),
    ).toBeInTheDocument()
  })

  it('asks for the hard effort once each sport has enough activities', () => {
    const activities = [1, 2, 3].flatMap((n) => [
      makeActivity({ id: `run-${n}`, sport: 'run' }),
      makeActivity({ id: `ride-${n}`, sport: 'ride' }),
    ])
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult({ activities, comparison: { prior: [], calibrated: null } })}
        pick={null}
        gap={null}
      />,
    )
    expect(
      screen.getByText(
        'From 3 runs and 3 rides. A hard 20 min run or ride would let them be compared.',
      ),
    ).toBeInTheDocument()
  })

  it('names the period in the need, and offers All time when it holds enough', () => {
    const inPeriod = [
      makeActivity({ id: 'run-1', sport: 'run' }),
      ...[1, 2, 3].map((n) => makeActivity({ id: `ride-${n}`, sport: 'ride' })),
    ]
    const library = [
      ...inPeriod,
      makeActivity({ id: 'run-2', sport: 'run' }),
      makeActivity({ id: 'run-3', sport: 'run' }),
    ]
    render(
      <BalanceHero
        {...ALL_TIME}
        period={SIX_WEEKS}
        library={library}
        result={makeResult({ activities: inPeriod })}
        pick={null}
        gap={null}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Not enough to compare yet' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('From 1 run and 3 rides. Needs 2 more runs in this period.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show all time' })).toBeInTheDocument()
  })

  it('counts each sport under the lede when either has few efforts, so the answer shows what it rests on', () => {
    const activities = [
      makeActivity({ id: 'run-1', sport: 'run' }),
      makeActivity({ id: 'run-2', sport: 'run', durationS: 600 }),
      makeActivity({ id: 'run-3', sport: 'run', durationS: 600 }),
      makeActivity({ id: 'ride-1', sport: 'ride' }),
      makeActivity({ id: 'ride-2', sport: 'ride' }),
      makeActivity({ id: 'ride-3', sport: 'ride', durationS: 600 }),
    ]
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult({ activities })}
        pick={pickFor(interval(1.05, 1.12, 1.2))}
        gap={gradedGap()}
      />,
    )
    expect(
      screen.getByText('From 1 run and 2 rides. Add more runs or rides for a steadier answer.'),
    ).toBeInTheDocument()
  })

  it('counts only the efforts as long as the headline effort, so a short run does not count as one', () => {
    const runs = [
      makeActivity({ id: 'run-1', sport: 'run' }),
      makeActivity({ id: 'run-2', sport: 'run', durationS: 600 }),
      makeActivity({ id: 'run-3', sport: 'run', durationS: 900 }),
    ]
    const rides = [1, 2, 3].map((n) => makeActivity({ id: `ride-${n}`, sport: 'ride' }))
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult({ activities: [...runs, ...rides] })}
        pick={pickFor(interval(1.05, 1.12, 1.2))}
        gap={gradedGap()}
      />,
    )
    expect(
      screen.getByText('From 1 run and 3 rides. Add more runs or rides for a steadier answer.'),
    ).toBeInTheDocument()
  })

  it('leaves that count off once each sport has three efforts', () => {
    const runs = [1, 2, 3].map((n) => makeActivity({ id: `run-${n}`, sport: 'run' }))
    const rides = [1, 2, 3].map((n) => makeActivity({ id: `ride-${n}`, sport: 'ride' }))
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult({ activities: [...runs, ...rides] })}
        pick={pickFor(interval(1.05, 1.12, 1.2))}
        gap={gradedGap()}
      />,
    )
    expect(screen.queryByText(/steadier answer/)).not.toBeInTheDocument()
  })

  it('tells the meter the range was adjusted by heart rate, when the check used it', () => {
    const { container } = render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult()}
        pick={{ point: comparisonPoint({ ratio: interval(1.05, 1.12, 1.2) }), calibrated: true }}
        gap={gradedGap()}
      />,
    )
    expect(container.querySelector('.balance-meter__key')?.textContent).toMatch(
      /Adjusted by heart rate\.$/,
    )
  })

  it('leaves the dates out of the lede when the period is not all time, since the caption names them', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        period={SIX_WEEKS}
        result={makeResult()}
        pick={pickFor(interval(1.05, 1.12, 1.2))}
        gap={gradedGap()}
      />,
    )
    expect(
      screen.getByText(
        'Running’s age grade is 6 points higher than cycling’s at 20 min, within 2 to 10 points.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/12 May/)).not.toBeInTheDocument()
  })

  it('leaves the dates out of the lede under all time', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        result={makeResult()}
        pick={pickFor(interval(1.05, 1.12, 1.2))}
        gap={gradedGap()}
      />,
    )
    expect(
      screen.getByText(
        'Running’s age grade is 6 points higher than cycling’s at 20 min, within 2 to 10 points.',
      ),
    ).toBeInTheDocument()
  })

  it('sets the action under the lede, on the text column, so the share button sits with the answer', () => {
    render(
      <BalanceHero
        {...ALL_TIME}
        action={<button type="button">Download square image</button>}
        result={makeResult({ activities: [], comparison: { prior: [], calibrated: null } })}
        pick={null}
        gap={null}
      />,
    )
    const heading = screen.getByRole('heading', { level: 1 })
    const action = screen.getByRole('button', { name: 'Download square image' })
    expect(heading.parentElement).toHaveClass('balance-hero__head')
    expect(heading.parentElement).not.toContainElement(action)
    expect(action.parentElement).toHaveClass('balance-hero')
    expect(action.previousElementSibling).toBe(
      screen.getByText('Your files have no running or cycling activities yet.'),
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
