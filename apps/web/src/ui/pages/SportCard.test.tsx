// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { curvePoint } from '../charts/fixtures'
import {
  FIVE_K_IN_20_MIN_WKG,
  MAN_BORN_1986,
  flatWkg,
  interval,
  makeActivity,
  makeEquivalence,
  makeResult,
} from '../components/fixtures'
import { headlineGrades } from '../grades'
import { noMatchMedia, viewportAt } from '../../test/viewport'
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
  powerSource: 'virtual',
})

/** The card, given the profile the page would pass; null is a profile without a year or sex. */
function renderCard(
  sport: Sport,
  result: AnalysisResult,
  units: UnitSystem = 'metric',
  profile: AgeProfile | null = MAN_BORN_1986,
  weighted = true,
) {
  const grade = profile === null ? null : headlineGrades(result, profile)[sport]
  return render(
    <SportCard
      sport={sport}
      result={result}
      units={units}
      massKg={75}
      grade={grade}
      weighted={weighted}
    />,
  )
}

/** The card for one sport, named by its heading. */
function cardNamed(name: 'Run' | 'Ride'): HTMLElement {
  return screen.getByRole('region', { name })
}

/** The hero figure's text, its number and unit read together, such as "23:23 /km". */
function heroOf(card: HTMLElement): string | null | undefined {
  return card.querySelector('.hero-number')?.textContent
}

describe('SportCard grading link', () => {
  it('places How is this graded? straight after the grade line, linking to the age grades', () => {
    renderCard(
      'run',
      makeResult({
        activities: [runOnMonday],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
    )

    const card = cardNamed('Run')
    const line = card.querySelector('.age-grade__line')
    const link = within(card).getByRole('link', { name: 'How is this graded?' })
    expect(link).toHaveAttribute('href', '#/method')
    expect(line?.nextElementSibling).toBe(link)
  })
})

describe('SportCard threshold', () => {
  it('shows the running threshold as a named pace estimate', () => {
    renderCard('run', makeResult({ activities: [runOnMonday] }))

    const card = cardNamed('Run')
    expect(within(card).getByText('Threshold pace, estimated')).toBeInTheDocument()
    expect(heroOf(card)).toBe('23:23 /km')
  })

  it('says in plain words what the threshold is, about that pace, under the number', () => {
    renderCard('run', makeResult({ activities: [runOnMonday] }))
    expect(
      within(cardNamed('Run')).getByText(
        'About the pace you could hold for a long, steady effort, estimated from your best 3 to 20 min efforts.',
      ),
    ).toBeInTheDocument()
  })

  it('shows the running threshold in miles for imperial', () => {
    renderCard('run', makeResult({ activities: [runOnMonday] }), 'imperial')
    expect(heroOf(cardNamed('Run'))).toBe('37:38 /mi')
  })

  it('sets the unit in a smaller span beside the number, so the number stays the hero', () => {
    renderCard('run', makeResult({ activities: [runOnMonday] }))
    const unit = cardNamed('Run').querySelector('.hero-number__unit')
    expect(unit).toHaveTextContent('/km')
    expect(unit?.closest('.hero-number')).not.toBeNull()
  })

  it('shows the cycling threshold in watts with its W/kg for the body mass', () => {
    renderCard('ride', makeResult({ activities: [rideOnFriday] }))

    const card = cardNamed('Ride')
    expect(within(card).getByText('Threshold power, estimated')).toBeInTheDocument()
    expect(heroOf(card)).toBe('48 W')
    expect(within(card).getByText('0.6 W/kg')).toBeInTheDocument()
  })

  it('hides the number and asks for efforts between 3 and 20 min when there is no threshold', () => {
    renderCard('run', makeResult({ activities: [runOnMonday], runCp: null }))

    const card = cardNamed('Run')
    expect(within(card).getByText('Needs efforts between 3 and 20 min')).toBeInTheDocument()
    expect(card.querySelector('.hero-number')).toBeNull()
  })

  it('asks for a harder effort between 3 and 20 min when the efforts show no threshold', () => {
    renderCard('run', makeResult({ activities: [runOnMonday], runCp: null, runCpRefusal: 'shape' }))

    const card = cardNamed('Run')
    expect(within(card).getByText('Needs a harder effort between 3 and 20 min')).toBeInTheDocument()
    expect(within(card).queryByText('Needs efforts between 3 and 20 min')).not.toBeInTheDocument()
  })

  it('shows no threshold meaning when there is no threshold to explain', () => {
    renderCard('run', makeResult({ activities: [runOnMonday], runCp: null }))

    expect(within(cardNamed('Run')).queryByText(/About the pace/)).not.toBeInTheDocument()
  })

  it('asks for efforts between 3 and 20 min on the cycling card when there is no cycling threshold', () => {
    renderCard('ride', makeResult({ activities: [rideOnFriday], rideCp: null }))

    const card = cardNamed('Ride')
    expect(within(card).getByText('Needs efforts between 3 and 20 min')).toBeInTheDocument()
    expect(within(card).queryByText(/W\/kg/)).not.toBeInTheDocument()
  })
})

describe('SportCard records', () => {
  it('lists the 5, 20 and 60 minute bests, and names the one activity that set them all', () => {
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
    expect(within(card).getByText('1 hour')).toBeInTheDocument()
    expect(within(card).queryByText('1 min')).not.toBeInTheDocument()
    expect(card.querySelector('.records__shared')).toHaveTextContent(
      'All set on Morning run, 5 Jan',
    )
  })

  it('links a record to the activity that set it, named with its duration and the day', () => {
    renderCard(
      'run',
      makeResult({
        activities: [runOnMonday],
        runCurve: [curvePoint(1200, 3.6, 'run-1'), curvePoint(3600, 3.1, 'other')],
      }),
    )

    expect(
      within(cardNamed('Run')).getByRole('link', {
        name: '20 min, from Morning run, 5 Jan',
      }),
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
    expect(within(card).queryByRole('link', { name: /Morning run/ })).not.toBeInTheDocument()
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
    expect(
      within(card).getByRole('link', { name: '5 min, from Hill ride, 9 Jan' }),
    ).toHaveAttribute('href', '#/activities/ride-1')
  })

  it('tags a cycling record estimated when its watts came from virtual power', () => {
    renderCard(
      'ride',
      makeResult({ activities: [rideOnFriday], rideCurve: [curvePoint(300, 400, 'ride-1')] }),
    )
    expect(within(cardNamed('Ride')).getByText('Estimated')).toBeInTheDocument()
  })

  it('leaves the tag off a cycling record whose watts were measured', () => {
    const measured = makeActivity({ ...rideOnFriday, powerSource: 'measured' })
    renderCard(
      'ride',
      makeResult({ activities: [measured], rideCurve: [curvePoint(300, 400, 'ride-1')] }),
    )
    expect(within(cardNamed('Ride')).queryByText('Estimated')).not.toBeInTheDocument()
  })

  it('shows no record list when the sport has no best efforts at those durations', () => {
    renderCard('ride', makeResult({ activities: [rideOnFriday], rideCurve: [] }))
    expect(within(cardNamed('Ride')).queryByRole('listitem')).not.toBeInTheDocument()
  })
})

describe('SportCard run grade', () => {
  it('names the effort the grade is for on the grade line, and reads the grade as recorded', () => {
    renderCard(
      'run',
      makeResult({
        activities: [runOnMonday],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
    )

    const card = cardNamed('Run')
    expect(card.querySelector('.age-grade__line')).toHaveTextContent(
      'Local · 67% · on your best 20 min, 4:00 /km',
    )
    expect(within(card).queryByText(/Estimated age grade/)).not.toBeInTheDocument()
    expect(within(card).queryByText(/Estimated · /)).not.toBeInTheDocument()
  })

  it('labels the hour record in words, as the sport page does', () => {
    renderCard(
      'run',
      makeResult({
        activities: [runOnMonday],
        runCurve: [curvePoint(3600, flatWkg(4.5), 'run-1')],
      }),
    )

    expect(within(cardNamed('Run')).getByText('1 hour')).toBeInTheDocument()
  })

  it('explains the Flat mark on a run card that has records but no grade, as without a profile', () => {
    renderCard(
      'run',
      makeResult({
        activities: [runOnMonday],
        runCurve: [curvePoint(300, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      'metric',
      null,
    )

    const card = cardNamed('Run')
    expect(within(card).getAllByText('Flat')).not.toHaveLength(0)
    expect(
      within(card).getByText('Flat pace: your pace allowing for hills, as if on level ground.'),
    ).toBeInTheDocument()
  })

  it('explains the Flat mark on a run card whose headline grade is a gap', () => {
    // Five minutes but no twenty: the records show, and the grade line says why there is no grade.
    renderCard(
      'run',
      makeResult({
        activities: [runOnMonday],
        runCurve: [curvePoint(300, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
    )

    const card = cardNamed('Run')
    expect(
      within(card).getByText('Flat pace: your pace allowing for hills, as if on level ground.'),
    ).toBeInTheDocument()
  })

  it('shows the ladder, a key to its solid dot, and the note on the flat pace of a run', () => {
    renderCard(
      'run',
      makeResult({
        activities: [runOnMonday],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
    )

    const card = cardNamed('Run')
    expect(
      within(card).getByRole('img', {
        name: 'Age grade 67%, Local, from your best 20 min, on the USATF road standards.',
      }),
    ).toBeInTheDocument()
    expect(
      within(card).getByText('Solid dot: the grade of one recorded effort.'),
    ).toBeInTheDocument()
    expect(
      within(card).getByText('Flat pace: your pace allowing for hills, as if on level ground.'),
    ).toBeInTheDocument()
    expect(within(card).queryByText(/^Graded at age/)).not.toBeInTheDocument()
  })

  it('marks each run record’s pace Flat, so its pace reads as a flat pace', () => {
    renderCard(
      'run',
      makeResult({
        activities: [runOnMonday],
        runCurve: [curvePoint(1200, 3.6, 'run-1'), curvePoint(3600, 3.1, 'run-1')],
      }),
    )
    expect(within(cardNamed('Run')).getAllByText('Flat')).toHaveLength(2)
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
  it('names the effort and its watts, and marks the grade and the watts as estimated', () => {
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
    expect(card.querySelector('.age-grade__line')).toHaveTextContent(
      'Estimated · Local to Regional · 67% (63–71%) · on your best 20 min, 400 W, estimated',
    )
    expect(
      within(card).getByRole('img', {
        name: 'Estimated age grade 67%, Local to Regional, from your best 20 min, range 63% to 71%, on the USATF road standards.',
      }),
    ).toBeInTheDocument()
    expect(within(card).getByText('Ring: estimated, with its range.')).toBeInTheDocument()
  })

  it('says the bracketed range is the 90% range, and leaves the standard to the source line under the cards', () => {
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

    expect(
      within(cardNamed('Ride')).getByText('The range in brackets is the 90% range.'),
    ).toBeInTheDocument()
    expect(
      within(cardNamed('Ride')).queryByText(
        'Flat pace: your pace allowing for hills, as if on level ground.',
      ),
    ).not.toBeInTheDocument()
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

describe('SportCard with no weight entered', () => {
  it('holds the ride threshold, its watts and W/kg, its grade and its records, and asks for the weight', () => {
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
      'metric',
      MAN_BORN_1986,
      false,
    )

    const card = cardNamed('Ride')
    expect(within(card).getByText('Threshold power, estimated')).toBeInTheDocument()
    expect(card.querySelector('.hero-number')).toBeNull()
    expect(within(card).queryByText(/W\/kg/)).not.toBeInTheDocument()
    expect(within(card).queryByText('400 W')).not.toBeInTheDocument()
    expect(within(card).queryByRole('listitem')).not.toBeInTheDocument()
    expect(card.querySelector('.age-grade__line')).toBeNull()
    expect(within(card).queryByRole('img')).toBeNull()
    expect(within(card).getByText(/Add your weight on/)).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '#/profile')
  })

  it('still shows the run, its threshold and its grade, because the run does not need the weight', () => {
    renderCard(
      'run',
      makeResult({
        activities: [runOnMonday],
        runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
      }),
      'metric',
      MAN_BORN_1986,
      false,
    )

    const card = cardNamed('Run')
    expect(heroOf(card)).toBe('23:23 /km')
    expect(card.querySelector('.age-grade__line')).toHaveTextContent('Local · 67%')
    expect(within(card).queryByText(/Add your weight/)).not.toBeInTheDocument()
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
      expect(within(card).queryByText(/Age grade/)).toBeNull()
    },
  )
})

describe('SportCard links', () => {
  it('links to the sport’s records with its plural, Run or Ride', () => {
    renderCard('run', makeResult({ activities: [runOnMonday] }))
    expect(within(cardNamed('Run')).getByRole('link', { name: 'All runs' })).toHaveAttribute(
      'href',
      '#/run',
    )
  })
})

describe('SportCard hero sub-line', () => {
  it('keeps the watts and the W/kg apart in the text, as they are apart on screen', () => {
    renderCard('ride', makeResult({ activities: [rideOnFriday] }))
    expect(cardNamed('Ride').textContent).toContain('48 W 0.6 W/kg')
  })
})

describe('SportCard best efforts on a phone', () => {
  const runCurve = [curvePoint(1200, FIVE_K_IN_20_MIN_WKG, 'run-1')]

  afterEach(() => {
    noMatchMedia()
  })

  it('folds the best efforts behind a closed disclosure on a phone, and keeps them in the card', () => {
    viewportAt(390)
    renderCard('run', makeResult({ activities: [runOnMonday], runCurve }))

    const disclosure = within(cardNamed('Run')).getByText('Best efforts').closest('details')
    expect(disclosure).not.toHaveAttribute('open')
    expect(within(disclosure as HTMLElement).getByText('20 min')).toBeInTheDocument()
  })

  it('opens the best efforts on a desktop', () => {
    viewportAt(1280)
    renderCard('run', makeResult({ activities: [runOnMonday], runCurve }))

    const disclosure = within(cardNamed('Run')).getByText('Best efforts').closest('details')
    expect(disclosure).toHaveAttribute('open')
  })

  it('keeps the disclosure the visitor chose on its summary, even when the window resizes before the toggle', () => {
    const viewport = viewportAt(1280)
    renderCard('run', makeResult({ activities: [runOnMonday], runCurve }))
    const summary = within(cardNamed('Run')).getByText('Best efforts')
    const disclosure = summary.closest('details')

    // The visitor closes it. The choice is made on the click, so a resize before the browser's toggle
    // event cannot undo it.
    fireEvent.click(summary)
    viewport.resize(390)
    viewport.resize(1280)

    expect(disclosure).not.toHaveAttribute('open')
  })

  it('follows the breakpoint until the visitor chooses: it reopens on a desktop, and a choice then holds', () => {
    const viewport = viewportAt(390)
    renderCard('run', makeResult({ activities: [runOnMonday], runCurve }))
    const summary = within(cardNamed('Run')).getByText('Best efforts')
    const disclosure = summary.closest('details')
    expect(disclosure).not.toHaveAttribute('open')

    viewport.resize(1280)
    expect(disclosure).toHaveAttribute('open')
    viewport.resize(390)
    expect(disclosure).not.toHaveAttribute('open')

    // On the phone, the visitor opens it; the choice then holds across the breakpoint.
    fireEvent.click(summary)
    viewport.resize(1280)
    viewport.resize(390)
    expect(disclosure).toHaveAttribute('open')
  })
})
