// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeResult } from '../components/fixtures'
import { profileActivities, profileCurve } from '../profileFixtures'
import { StandOutSection } from './StandOutSection'
import { standOutFinding, standOutOf } from './standOut'
import { standOutLack } from './standOutLack'

afterEach(cleanup)

/** A ride whose 1 min best stands out, so its strip is drawn. */
const standing = makeResult({
  activities: profileActivities('ride', 'measured'),
  rideMeasuredCurve: profileCurve((durationS, value) => (durationS === 60 ? value * 1.15 : value)),
})

/** The section as the page draws it once it is open: the note and the strip, from what the bests say. */
function renderSection(sport: 'run' | 'ride', result: ReturnType<typeof makeResult>) {
  const profile = standOutOf(result, sport)
  if (profile === null) throw new Error('the bests cannot be compared')
  return render(<StandOutSection sport={sport} profile={profile} />)
}

describe('the stand-out finding', () => {
  it('says which best stands out, with its size, as the closed row’s line', () => {
    const profile = standOutOf(standing, 'ride')!
    expect(standOutFinding(profile)).toMatch(
      /^Your 1 min best is 1\d% above what your other bests suggest\.$/,
    )
  })

  it('says the bests are in line when nothing stands out, naming the span in whole minutes', () => {
    const result = makeResult({ activities: profileActivities('run'), runCurve: profileCurve() })
    expect(standOutFinding(standOutOf(result, 'run')!)).toBe(
      'Your bests are in line with each other, compared from 3 min to 60 min.',
    )
  })

  it('says a low best may be relatively low or untested', () => {
    const result = makeResult({
      activities: profileActivities('run'),
      runCurve: profileCurve((durationS, value) => (durationS === 300 ? value * 0.8 : value)),
    })
    expect(standOutFinding(standOutOf(result, 'run')!)).toMatch(
      /^Your 5 min best is (1[89]|2\d)% below what your other bests suggest: it may be relatively low, or untested\.$/,
    )
  })

  it('is none while the bests cannot be compared', () => {
    const result = makeResult({
      activities: profileActivities('ride', 'measured'),
      rideMeasuredCurve: profileCurve((_, value) => value, [720, 900, 1200, 1800, 2700, 3600]),
    })
    expect(standOutOf(result, 'ride')).toBeNull()
  })

  it('never ranks or praises in its words', () => {
    const result = makeResult({
      activities: profileActivities('ride', 'measured'),
      rideMeasuredCurve: profileCurve((durationS, value) =>
        durationS === 60 ? value * 1.15 : durationS === 300 ? value * 0.8 : value,
      ),
    })
    const { container } = renderSection('ride', result)
    const text = `${standOutFinding(standOutOf(result, 'ride')!)} ${container.textContent ?? ''}`
    for (const word of ['limiter', 'weak', 'strength', 'holding you back', 'ahead of']) {
      expect(text.toLowerCase()).not.toContain(word)
    }
  })
})

describe('StandOutSection', () => {
  it('draws the strip of every best against the others when one stands out, with no heading', () => {
    renderSection('ride', standing)
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.getByRole('figure')).toBeInTheDocument()
  })

  it('draws no strip when nothing stands out', () => {
    const result = makeResult({ activities: profileActivities('run'), runCurve: profileCurve() })
    renderSection('run', result)
    expect(screen.queryByRole('figure')).toBeNull()
  })

  it('says why the short end is missing without a best at 15 s or under', () => {
    const result = makeResult({
      activities: profileActivities('ride', 'measured'),
      rideMeasuredCurve: profileCurve((_, value) => value, [5, 10, 15]),
    })
    renderSection('ride', result)
    expect(
      screen.getByText(
        'Shown from 2 min: there is no best at 15 s or under to anchor the short end.',
      ),
    ).toBeInTheDocument()
  })

  it('gives a run no short-end note and names no duration under 3 minutes, however short its curve goes', () => {
    const result = makeResult({
      activities: profileActivities('run'),
      runCurve: profileCurve((durationS, value) => (durationS <= 120 ? value * 1.4 : value)),
    })
    const { container } = renderSection('run', result)
    expect(screen.queryByText(/Shown from/)).toBeNull()
    expect(container.textContent).not.toMatch(/\b\d+ s\b|\b[12] min\b/)
  })

  it('draws a run’s strip from 3 minutes, with nothing shorter', () => {
    const result = makeResult({
      activities: profileActivities('run'),
      runCurve: profileCurve((durationS, value) => (durationS === 1200 ? value * 1.15 : value)),
    })
    renderSection('run', result)
    const strip = screen.getByRole('figure')
    expect(strip.textContent).toMatch(/3 min/)
    expect(strip.textContent).not.toMatch(/\b(5|10|30) s\b|\b1 min\b/)
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
    const rising = profileCurve((durationS) => 100 + durationS / 20)
    const result = makeResult({ activities: profileActivities('run'), runCurve: rising })
    expect(standOutLack('run', result)).toBe(
      'Where your bests stand out: a curve could not be fitted to your bests, so none is compared.',
    )
  })
})
