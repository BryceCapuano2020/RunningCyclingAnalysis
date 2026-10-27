// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeResult } from '../components/fixtures'
import { profileActivities, profileCurve } from '../profileFixtures'
import { StandOutSection } from './StandOutSection'

afterEach(cleanup)

const HEADING = 'Where your bests stand out'

describe('StandOutSection', () => {
  it('says which best stands out above, with its size, over a chart', () => {
    const result = makeResult({
      activities: profileActivities('ride', 'measured'),
      rideMeasuredCurve: profileCurve((durationS, value) =>
        durationS === 60 ? value * 1.15 : value,
      ),
    })
    render(<StandOutSection sport="ride" result={result} />)
    expect(screen.getByRole('heading', { level: 2, name: HEADING })).toBeInTheDocument()
    expect(
      screen.getByText(/^Your 1 min best is 1\d% above what your other bests suggest\.$/),
    ).toBeInTheDocument()
    expect(screen.getByRole('figure')).toBeInTheDocument()
  })

  it('says a low best may be relatively low or untested', () => {
    const result = makeResult({
      activities: profileActivities('run'),
      runCurve: profileCurve((durationS, value) => (durationS === 300 ? value * 0.8 : value)),
    })
    render(<StandOutSection sport="run" result={result} />)
    expect(
      screen.getByText(
        /^Your 5 min best is 2\d% below what your other bests suggest: it may be relatively low, or untested\.$/,
      ),
    ).toBeInTheDocument()
  })

  it('says the bests are in line when nothing stands out, naming the span in whole minutes, with no chart', () => {
    const result = makeResult({
      activities: profileActivities('run'),
      runCurve: profileCurve(),
    })
    render(<StandOutSection sport="run" result={result} />)
    expect(
      screen.getByText('Your bests are in line with each other from 5 s to 60 min.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('figure')).toBeNull()
  })

  it('says why the short end is missing without a best at 15 s or under', () => {
    const result = makeResult({
      activities: profileActivities('run'),
      runCurve: profileCurve((_, value) => value, [5, 10, 15]),
    })
    render(<StandOutSection sport="run" result={result} />)
    expect(
      screen.getByText(
        'Shown from 2 min: there is no best at 15 s or under to anchor the short end.',
      ),
    ).toBeInTheDocument()
  })

  it('shows one muted line, and no chart, when the bests do not reach 12 min', () => {
    const result = makeResult({
      activities: profileActivities('ride', 'measured'),
      rideMeasuredCurve: profileCurve((_, value) => value, [720, 900, 1200, 1800, 2700, 3600]),
    })
    render(<StandOutSection sport="ride" result={result} />)
    const line = screen.getByText('Needs a best at 12 min or more, with a power meter')
    expect(line).toHaveClass('muted')
    expect(screen.queryByRole('figure')).toBeNull()
  })

  it('asks a ride without a power meter for one, since estimated watts are never compared', () => {
    const result = makeResult({
      activities: profileActivities('ride', 'measured'),
      rideCurve: profileCurve(),
      rideMeasuredCurve: [],
    })
    render(<StandOutSection sport="ride" result={result} />)
    expect(screen.getByText(/with a power meter$/)).toBeInTheDocument()
    expect(screen.queryByRole('figure')).toBeNull()
  })

  it('says a curve could not be fitted, rather than naming something missing, when none fits', () => {
    const rising = profileCurve(
      (durationS) => 100 + durationS / 20,
      [10, 15, 30, 45, 90, 120, 180, 240, 420, 600, 900, 1800, 2700],
    )
    const result = makeResult({
      activities: profileActivities('run'),
      runCurve: rising,
    })
    render(<StandOutSection sport="run" result={result} />)
    expect(
      screen.getByText('A curve could not be fitted to your bests, so none is compared'),
    ).toHaveClass('muted')
    expect(screen.queryByRole('figure')).toBeNull()
  })

  it('never ranks or praises in its words', () => {
    const result = makeResult({
      activities: profileActivities('ride', 'measured'),
      rideMeasuredCurve: profileCurve((durationS, value) =>
        durationS === 60 ? value * 1.15 : durationS === 300 ? value * 0.8 : value,
      ),
    })
    const { container } = render(<StandOutSection sport="ride" result={result} />)
    const text = (container.textContent ?? '').toLowerCase()
    for (const word of ['limiter', 'weak', 'strength', 'holding you back', 'ahead of']) {
      expect(text).not.toContain(word)
    }
  })
})
