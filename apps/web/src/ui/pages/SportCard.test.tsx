// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { curvePoint } from '../charts/fixtures'
import {
  FIVE_K_IN_20_MIN_WKG,
  MAN_BORN_1986,
  interval,
  makeActivity,
  makeEquivalence,
  makeResult,
} from '../components/fixtures'
import { headlineGrades } from '../grades'
import type { AgeProfile } from '../grades'
import { SportCard } from './SportCard'

// A fixed clock, so the year on each record date does not depend on when the suite runs.
const NOW = new Date(2026, 5, 10, 12).getTime()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// Local dates: 5 January 2026 is a Monday and 9 January 2026 a Friday.
const runOnMonday = makeActivity({
  id: 'run-1',
  name: 'Morning run',
  sport: 'run',
  startMs: new Date(2026, 0, 5, 7, 30).getTime(),
})
const rideOnFriday = makeActivity({
  id: 'ride-1',
  name: 'Hill ride',
  sport: 'ride',
  startMs: new Date(2026, 0, 9, 17, 0).getTime(),
})

/** The card, given the profile the page would pass; null is a profile without a year or sex. */
function renderCard(
  sport: Sport,
  result: AnalysisResult,
  units: UnitSystem = 'metric',
  profile: AgeProfile | null = MAN_BORN_1986,
) {
  const grade = profile === null ? null : headlineGrades(result, profile)[sport]
  return render(<SportCard sport={sport} result={result} units={units} massKg={75} grade={grade} />)
}

/** The card for one sport, named by its heading. */
function cardNamed(name: 'Run' | 'Ride'): HTMLElement {
  return screen.getByRole('region', { name })
}

describe('SportCard without activities of its sport', () => {
  it('says runs are needed to see the running balance, and still links to the running records', () => {
    renderCard('run', makeResult({ activities: [rideOnFriday], runCurve: [] }))

    const card = cardNamed('Run')
    expect(
      within(card).getByText('Add runs to see your running and your balance.'),
    ).toBeInTheDocument()
    expect(within(card).queryByText('Threshold pace, estimated')).not.toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'All running records' })).toHaveAttribute(
      'href',
      '#/run',
    )
  })

  it('says rides are needed to see the cycling balance', () => {
    renderCard('ride', makeResult({ activities: [runOnMonday], rideCurve: [] }))

    const card = cardNamed('Ride')
    expect(
      within(card).getByText('Add rides to see your cycling and your balance.'),
    ).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'All cycling records' })).toHaveAttribute(
      'href',
      '#/ride',
    )
  })
})

describe('SportCard threshold', () => {
  it('shows the running threshold as a named pace estimate', () => {
    renderCard('run', makeResult({ activities: [runOnMonday] }))

    const card = cardNamed('Run')
    expect(within(card).getByText('Threshold pace, estimated')).toBeInTheDocument()
    expect(within(card).getByText('23:23 /km')).toBeInTheDocument()
  })

  it('shows the running threshold in miles for imperial', () => {
    renderCard('run', makeResult({ activities: [runOnMonday] }), 'imperial')
    expect(within(cardNamed('Run')).getByText('37:38 /mi')).toBeInTheDocument()
  })

  it('shows the cycling threshold in watts with its W/kg for the body mass', () => {
    renderCard('ride', makeResult({ activities: [rideOnFriday] }))

    const card = cardNamed('Ride')
    expect(within(card).getByText('Threshold power, estimated')).toBeInTheDocument()
    expect(within(card).getByText('48 W')).toBeInTheDocument()
    expect(within(card).getByText('0.6 W/kg')).toBeInTheDocument()
  })

  it('asks for a hard effort instead of a number when a sport has no threshold yet', () => {
    renderCard('run', makeResult({ activities: [runOnMonday], runCp: null }))

    const card = cardNamed('Run')
    expect(within(card).getByText('Needs a hard effort of 2 to 20 min.')).toBeInTheDocument()
    expect(card.querySelector('.hero-number')).toBeNull()
  })

  it('asks for a hard effort on the cycling card when there is no cycling threshold', () => {
    renderCard('ride', makeResult({ activities: [rideOnFriday], rideCp: null }))

    const card = cardNamed('Ride')
    expect(within(card).getByText('Needs a hard effort of 2 to 20 min.')).toBeInTheDocument()
    expect(within(card).queryByText(/W\/kg/)).not.toBeInTheDocument()
  })
})

describe('SportCard records', () => {
  it('lists the 5, 20 and 60 minute bests, each with the friendly day it was set', () => {
    renderCard(
      'run',
      makeResult({
        activities: [runOnMonday],
        runCurve: [
          curvePoint(60, 5.5, 'run-1'),
          curvePoint(300, 4.1, 'run-1'),
          curvePoint(1200, 3.6, 'run-1'),
          curvePoint(3600, 3.1, 'run-1'),
        ],
      }),
    )

    const card = cardNamed('Run')
    const records = within(card).getAllByRole('listitem')
    expect(records).toHaveLength(3)
    expect(within(card).getByText('5 min')).toBeInTheDocument()
    expect(within(card).getByText('20 min')).toBeInTheDocument()
    expect(within(card).getByText('1 h')).toBeInTheDocument()
    expect(within(card).queryByText('1 min')).not.toBeInTheDocument()
  })

  it('links each record to the activity that set it, named with the day it was set', () => {
    renderCard(
      'run',
      makeResult({
        activities: [runOnMonday],
        runCurve: [curvePoint(1200, 3.6, 'run-1')],
      }),
    )

    expect(
      within(cardNamed('Run')).getByRole('link', { name: 'Morning run, Mon 5 Jan' }),
    ).toHaveAttribute('href', '#/activities/run-1')
  })

  it('keeps a record’s value but drops its link when its activity is not in the result', () => {
    renderCard(
      'run',
      makeResult({
        activities: [runOnMonday],
        runCurve: [curvePoint(1200, 3.6, 'gone')],
      }),
    )

    const card = cardNamed('Run')
    expect(within(card).getByText('20 min')).toBeInTheDocument()
    expect(within(card).queryByRole('link', { name: /Mon 5 Jan/ })).not.toBeInTheDocument()
  })

  it('shows cycling records in watts, linked to the ride that set them', () => {
    renderCard(
      'ride',
      makeResult({
        activities: [rideOnFriday],
        rideCurve: [curvePoint(300, 400, 'ride-1')],
      }),
    )

    const card = cardNamed('Ride')
    expect(within(card).getByText('400 W')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Hill ride, Fri 9 Jan' })).toHaveAttribute(
      'href',
      '#/activities/ride-1',
    )
  })

  it('shows no record list when the sport has no best efforts at those durations', () => {
    renderCard('ride', makeResult({ activities: [rideOnFriday], rideCurve: [] }))
    expect(within(cardNamed('Ride')).queryByRole('listitem')).not.toBeInTheDocument()
  })
})

describe('SportCard run grade', () => {
  it('shows the estimate under the hero, with its ladder and what it rests on', () => {
    renderCard(
      'run',
      makeResult({
        activities: [runOnMonday],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
    )

    const card = cardNamed('Run')
    expect(within(card).getByText('Estimated age grade 67.6% · Local')).toBeInTheDocument()
    expect(
      within(card).getByRole('img', {
        name: 'Estimated age grade 67.6%, Local, from one activity, on the USATF road standards.',
      }),
    ).toBeInTheDocument()
    expect(
      within(card).getByText(
        'Estimate from your best 20 min, aged 40, on the USATF road standards.',
      ),
    ).toBeInTheDocument()
    expect(within(card).queryByText(/Graded through its running equivalent/)).toBeNull()
  })

  it('asks for a best 20-minute effort when the run has none at that length', () => {
    renderCard(
      'run',
      makeResult({
        activities: [runOnMonday],
        runCurve: [curvePoint(300, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
    )

    const card = cardNamed('Run')
    expect(within(card).getByText('Age grade needs a best 20 min effort.')).toBeInTheDocument()
    expect(within(card).queryByRole('img')).toBeNull()
  })

  it('says the standards cover ages 5 to 100 when the age on the run’s date is outside them', () => {
    renderCard(
      'run',
      makeResult({
        activities: [runOnMonday],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      'metric',
      { birthYear: 1900, sex: 'male' },
    )

    expect(
      within(cardNamed('Run')).getByText('Age grades cover ages 5 to 100.'),
    ).toBeInTheDocument()
  })
})

describe('SportCard ride grade', () => {
  it('shows the centre grade with its range, and says it is graded through its running equivalent', () => {
    renderCard(
      'ride',
      makeResult({
        activities: [rideOnFriday],
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
        equivalents: [
          makeEquivalence({
            durationS: HEADLINE_DURATION_S,
            runSpeed: interval(3.9, 5000 / HEADLINE_DURATION_S, 4.4),
          }),
        ],
      }),
    )

    const card = cardNamed('Ride')
    expect(
      within(card).getByText('Estimated age grade 67.6% · Local (63–71.5%)'),
    ).toBeInTheDocument()
    expect(within(card).getByText(/Graded through its running equivalent/)).toBeInTheDocument()
    expect(
      within(card).getByRole('img', {
        name: 'Estimated age grade 67.6%, Local, range 63% to 71.5%, on the USATF road standards.',
      }),
    ).toBeInTheDocument()
  })

  it('says the ride has no running equivalent to grade when its best effort has none', () => {
    renderCard(
      'ride',
      makeResult({
        activities: [rideOnFriday],
        rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
        equivalents: [],
      }),
    )
    expect(
      within(cardNamed('Ride')).getByText(
        'This best effort has no age standard or running equivalent to grade it.',
      ),
    ).toBeInTheDocument()
  })
})

describe('SportCard without the year of birth or sex', () => {
  it.each(['run', 'ride'] as const)(
    'shows no grade and no prompt on the %s card, because the balance page asks once',
    (sport) => {
      renderCard(
        sport,
        makeResult({ activities: [sport === 'run' ? runOnMonday : rideOnFriday] }),
        'metric',
        null,
      )

      const card = cardNamed(sport === 'run' ? 'Run' : 'Ride')
      expect(within(card).queryByRole('img')).toBeNull()
      expect(within(card).queryByRole('link', { name: /age-graded levels/ })).toBeNull()
      expect(within(card).queryByText(/Estimated age grade/)).toBeNull()
    },
  )
})
