// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeResult } from '../components/fixtures'
import { profileActivities, profileCurve } from '../profileFixtures'
import { StandOutSection } from './StandOutSection'
import { standOutFinding, standOutFor } from './standOut'
import type { StandOut } from './standOut'
import type { ReadyProfile } from '@rca/core/profile'

afterEach(cleanup)

/** A ride whose 1 min best stands out, so its strip is drawn. */
const standing = makeResult({
  activities: profileActivities('ride', 'measured'),
  rideMeasuredCurve: profileCurve((durationS, value) => (durationS === 60 ? value * 1.15 : value)),
})

type Result = ReturnType<typeof makeResult>

/** What the period's own bests say, with no library to read instead. */
function answerOf(result: Result, sport: 'run' | 'ride'): StandOut {
  const held = result.activities.filter((activity) => activity.sport === sport).length
  return standOutFor(result, sport, null, result.activities, held)
}

/** The period's profile, or null while its bests cannot be compared. */
function standOutOf(result: Result, sport: 'run' | 'ride'): ReadyProfile | null {
  const answer = answerOf(result, sport)
  return 'profile' in answer ? answer.profile : null
}

/** The section as the page draws it once it is open: the note and the strip, from what the bests say. */
function renderSection(sport: 'run' | 'ride', result: Result) {
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

  it('says only that nothing stands out when nothing does, naming no span', () => {
    const result = makeResult({ activities: profileActivities('run'), runCurve: profileCurve() })
    expect(standOutFinding(standOutOf(result, 'run')!)).toBe('Nothing stands out.')
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

  it('says nothing of why the short end is missing without a best at 15 s or under', () => {
    const result = makeResult({
      activities: profileActivities('ride', 'measured'),
      rideMeasuredCurve: profileCurve((_, value) => value, [5, 10, 15]),
    })
    const { container } = renderSection('ride', result)
    expect(container).not.toHaveTextContent(/Shown from|anchor the short end/)
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

describe('the best durations when they cannot be compared', () => {
  const lackOf = (result: Result, sport: 'run' | 'ride') => {
    const answer = answerOf(result, sport)
    return 'lack' in answer ? answer.lack : null
  }

  it('has no lack when the bests can be compared', () => {
    const result = makeResult({ activities: profileActivities('run'), runCurve: profileCurve() })
    expect(lackOf(result, 'run')).toBeNull()
  })

  it('names what a ride needs to be compared, a best at 12 min or more with a power meter', () => {
    const result = makeResult({
      activities: profileActivities('ride', 'measured'),
      rideMeasuredCurve: profileCurve((_, value) => value, [720, 900, 1200, 1800, 2700, 3600]),
    })
    expect(lackOf(result, 'ride')).toBe('Needs a best at 12 min or more, with a power meter')
  })

  it('asks a ride without a power meter for one, since estimated watts are never compared', () => {
    const result = makeResult({
      activities: profileActivities('ride', 'measured'),
      rideCurve: profileCurve(),
      rideMeasuredCurve: [],
    })
    expect(lackOf(result, 'ride')).toMatch(/with a power meter$/)
  })

  it('says a curve could not be fitted, rather than naming something missing, when none fits', () => {
    const rising = profileCurve((durationS) => 100 + durationS / 20)
    const result = makeResult({ activities: profileActivities('run'), runCurve: rising })
    expect(lackOf(result, 'run')).toBe(
      'A curve could not be fitted to your bests, so none is compared',
    )
  })
})

describe('the best durations of a period short of activities', () => {
  /** A ride's bests with the 1 min best 15% over the model, so it stands out wherever it is read. */
  const standingCurve = profileCurve((durationS, value) =>
    durationS === 60 ? value * 1.15 : value,
  )
  const few = makeResult({
    activities: profileActivities('ride', 'measured', 12),
    rideMeasuredCurve: profileCurve(),
  })
  const library = profileActivities('ride', 'measured', 40)

  it('reads the bests of the whole library, and says it is the library’s', () => {
    const answer = standOutFor(few, 'ride', standingCurve, library, 40)
    if (!('profile' in answer)) throw new Error('no answer')
    expect(answer.allTime).toBe(true)
    expect(answer.profile.rows.find((row) => row.durationS === 60)?.standsOut).toBe('above')
    // The period's own bests are in line, so the answer is the library's and not that.
    expect(standOutOf(few, 'ride')?.rows.every((row) => row.standsOut === null)).toBe(true)
  })

  it('judges the library at its own size, not the period’s', () => {
    const answer = standOutFor(few, 'ride', standingCurve, library, 40)
    if (!('profile' in answer)) throw new Error('no answer')
    expect(answer.profile.activities).toBe(40)
  })

  it('keeps the period’s own once it holds 40 activities of the sport', () => {
    const enough = makeResult({
      activities: profileActivities('ride', 'measured', 40),
      rideMeasuredCurve: profileCurve(),
    })
    const answer = standOutFor(enough, 'ride', standingCurve, library, 80)
    expect(answer).toMatchObject({ allTime: false })
  })

  it('keeps the period’s own when the library holds no more of the sport', () => {
    const answer = standOutFor(few, 'ride', standingCurve, library, 12)
    expect(answer).toMatchObject({ allTime: false })
  })

  it('keeps the period’s own when the library’s bests are not handed down', () => {
    expect(standOutFor(few, 'ride', null, library, 40)).toMatchObject({ allTime: false })
  })

  it('reads the library when the period’s bests cannot be compared at all', () => {
    const thin = makeResult({
      activities: profileActivities('ride', 'measured', 12),
      rideMeasuredCurve: profileCurve((_, value) => value, [720, 900, 1200, 1800, 2700, 3600]),
    })
    expect(standOutFor(thin, 'ride', standingCurve, library, 40)).toMatchObject({ allTime: true })
  })

  it('says what to add when neither the period nor the library can be compared', () => {
    const short = profileCurve((_, value) => value, [720, 900, 1200, 1800, 2700, 3600])
    const thin = makeResult({
      activities: profileActivities('ride', 'measured', 12),
      rideMeasuredCurve: short,
    })
    expect(standOutFor(thin, 'ride', short, library, 40)).toEqual({
      lack: 'Needs a best at 12 min or more, with a power meter',
    })
  })

  it('names the window in the sentence itself, as all-time bests', () => {
    const answer = standOutFor(few, 'ride', standingCurve, library, 40)
    if (!('profile' in answer)) throw new Error('no answer')
    expect(standOutFinding(answer.profile, true)).toMatch(
      /^Your all-time 1 min best is \d+% above what your other bests suggest\.$/,
    )
    expect(standOutFinding(answer.profile)).toMatch(/^Your 1 min best is/)
  })
})
