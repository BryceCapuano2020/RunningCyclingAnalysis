// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeResult } from '../components/fixtures'
import { profileActivities, profileCurve } from '../profileFixtures'
import { StandOutCaption } from './StandOutCaption'
import { standOutLack } from './standOutLack'

afterEach(cleanup)

const OPEN_STRIP = 'Show each best against the others'

/** Opens the strip's disclosure the way a press does. */
function openStrip() {
  const details = screen.getByText(OPEN_STRIP).closest('details')!
  details.open = true
  fireEvent(details, new Event('toggle'))
}

describe('StandOutCaption', () => {
  it('says which best stands out above, with its size, and offers the strip behind a disclosure', () => {
    const result = makeResult({
      activities: profileActivities('ride', 'measured'),
      rideMeasuredCurve: profileCurve((durationS, value) =>
        durationS === 60 ? value * 1.15 : value,
      ),
    })
    render(<StandOutCaption sport="ride" result={result} />)
    expect(screen.queryByRole('heading')).toBeNull()
    expect(
      screen.getByText(/^Your 1 min best is 1\d% above what your other bests suggest\.$/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('figure')).toBeNull()
    openStrip()
    expect(screen.getByRole('figure')).toBeInTheDocument()
  })

  it('says a low best may be relatively low or untested', () => {
    const result = makeResult({
      activities: profileActivities('run'),
      runCurve: profileCurve((durationS, value) => (durationS === 300 ? value * 0.8 : value)),
    })
    render(<StandOutCaption sport="run" result={result} />)
    expect(
      screen.getByText(
        /^Your 5 min best is 2\d% below what your other bests suggest: it may be relatively low, or untested\.$/,
      ),
    ).toBeInTheDocument()
  })

  it('says the bests are in line when nothing stands out, naming the span in whole minutes, with no strip', () => {
    const result = makeResult({
      activities: profileActivities('run'),
      runCurve: profileCurve(),
    })
    render(<StandOutCaption sport="run" result={result} />)
    expect(
      screen.getByText('Your bests are in line with each other from 5 s to 60 min.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(OPEN_STRIP)).toBeNull()
    expect(screen.queryByRole('figure')).toBeNull()
  })

  it('says why the short end is missing without a best at 15 s or under', () => {
    const result = makeResult({
      activities: profileActivities('run'),
      runCurve: profileCurve((_, value) => value, [5, 10, 15]),
    })
    render(<StandOutCaption sport="run" result={result} />)
    expect(
      screen.getByText(
        'Shown from 2 min: there is no best at 15 s or under to anchor the short end.',
      ),
    ).toBeInTheDocument()
  })

  it('shows nothing while the bests cannot be compared', () => {
    const result = makeResult({
      activities: profileActivities('ride', 'measured'),
      rideMeasuredCurve: profileCurve((_, value) => value, [720, 900, 1200, 1800, 2700, 3600]),
    })
    const { container } = render(<StandOutCaption sport="ride" result={result} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('never ranks or praises in its words', () => {
    const result = makeResult({
      activities: profileActivities('ride', 'measured'),
      rideMeasuredCurve: profileCurve((durationS, value) =>
        durationS === 60 ? value * 1.15 : durationS === 300 ? value * 0.8 : value,
      ),
    })
    const { container } = render(<StandOutCaption sport="ride" result={result} />)
    const text = (container.textContent ?? '').toLowerCase()
    for (const word of ['limiter', 'weak', 'strength', 'holding you back', 'ahead of']) {
      expect(text).not.toContain(word)
    }
  })
})

describe('standOutLack', () => {
  it('is null when the bests can be compared', () => {
    const result = makeResult({ activities: profileActivities('run'), runCurve: profileCurve() })
    expect(standOutLack('run', result)).toBeNull()
  })

  it('names what a ride needs to be compared, a best at 12 min or more with a power meter', () => {
    const result = makeResult({
      activities: profileActivities('ride', 'measured'),
      rideMeasuredCurve: profileCurve((_, value) => value, [720, 900, 1200, 1800, 2700, 3600]),
    })
    expect(standOutLack('ride', result)).toBe(
      'Where your bests stand out: needs a best at 12 min or more, with a power meter.',
    )
  })

  it('asks a ride without a power meter for one, since estimated watts are never compared', () => {
    const result = makeResult({
      activities: profileActivities('ride', 'measured'),
      rideCurve: profileCurve(),
      rideMeasuredCurve: [],
    })
    expect(standOutLack('ride', result)).toMatch(/with a power meter\.$/)
  })

  it('says a curve could not be fitted, rather than naming something missing, when none fits', () => {
    const rising = profileCurve(
      (durationS) => 100 + durationS / 20,
      [10, 15, 30, 45, 90, 120, 180, 240, 420, 600, 900, 1800, 2700],
    )
    const result = makeResult({ activities: profileActivities('run'), runCurve: rising })
    expect(standOutLack('run', result)).toBe(
      'Where your bests stand out: a curve could not be fitted to your bests, so none is compared.',
    )
  })
})
