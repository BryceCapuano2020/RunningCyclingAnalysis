// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../test/deviceZone'
import { PROFILE, balanceRows, rowOf, TWELVE_YEARS } from '../test/balanceFixtures'
import { RIDE_SLIPPING, SLIPPING } from '../test/fitnessFixtures'
import { dotsFixture, slipAndRise } from '../test/fitnessYearsFixtures'
import { THREE_YEARS } from '../test/historyFixtures'
import { RIDE_BESTS, RUN_BESTS } from '../test/historyBestsFixtures'
import { yearViews } from './balanceYears'
import { BalanceOverYearsChart } from './BalanceOverYearsChart'
import { BestsByYearChart } from './BestsByYearChart'
import { chartWidth } from './test/chartSizeStub'
import { FitnessChart } from './FitnessChart'
import { FitnessYearsChart } from './FitnessYearsChart'
import { curvePoint } from './test/fixtures'
import { HoursPerYearChart } from './HoursPerYearChart'
import { SportCurveChart } from './SportCurveChart'
import { INTERVAL_ZONES_TITLE, PERIOD_ZONES_TITLE } from './ZoneTimeChart'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const RUN_CURVE = [
  curvePoint(180, 5.0, 'a'),
  curvePoint(1200, 4.0, 'b'),
  curvePoint(3600, 3.5, 'b'),
]
const RIDE_CURVE = [
  curvePoint(60, 400, 'a'),
  curvePoint(1200, 250, 'b'),
  curvePoint(3600, 210, 'b'),
]
const sportCurve = (props: object) => (
  <SportCurveChart
    previous={{ curve: RUN_CURVE, label: 'Previous 6 weeks' }}
    change={null}
    massKg={75}
    units="metric"
    {...(props as { sport: 'run'; curve: typeof RUN_CURVE })}
  />
)

/** Each chart, by its component file, with the elements that make every title it can show. */
const CHARTS: Record<string, (() => ReactElement)[]> = {
  BalanceOverYearsChart: [
    () => <BalanceOverYearsChart views={yearViews(balanceRows(TWELVE_YEARS), PROFILE, true)} />,
    () => <BalanceOverYearsChart views={yearViews([rowOf(2021, 3.6, null)], PROFILE, true)} />,
    () => (
      <BalanceOverYearsChart
        views={yearViews([rowOf(2021, 3.6, 4.4), rowOf(2022, 3.6, 4.4)], PROFILE, true)}
      />
    ),
  ],
  BestsByYearChart: [
    () => <BestsByYearChart sport="run" efforts={RUN_BESTS} units="metric" />,
    () => <BestsByYearChart sport="ride" efforts={RIDE_BESTS} units="metric" />,
    () => <BestsByYearChart sport="run" efforts={[]} units="metric" />,
  ],
  FitnessChart: [
    () => <FitnessChart status={SLIPPING} units="metric" />,
    () => <FitnessChart status={RIDE_SLIPPING} units="metric" />,
  ],
  FitnessYearsChart: [
    () => (
      <FitnessYearsChart
        sport="run"
        dots={dotsFixture({ years: [2021, 2022], spans: slipAndRise(2021) })}
        units="metric"
      />
    ),
    () => (
      <FitnessYearsChart
        sport="ride"
        dots={dotsFixture({ sport: 'ride', years: [2021, 2022], spans: slipAndRise(2021) })}
        units="metric"
      />
    ),
  ],
  HoursPerYearChart: [() => <HoursPerYearChart years={THREE_YEARS} />],
  SportCurveChart: [
    () => sportCurve({ sport: 'run', curve: RUN_CURVE }),
    () => sportCurve({ sport: 'ride', curve: RIDE_CURVE }),
    () => sportCurve({ sport: 'ride', curve: [] }),
  ],
}

/** The title is passed in by the page that uses the chart: these are the constants those pages pass. */
const PASSED_IN: Record<string, string[]> = {
  ZoneTimeChart: [PERIOD_ZONES_TITLE, INTERVAL_ZONES_TITLE],
}

/** A sentence has a full stop, or a verb that states a result. */
const FINITE_VERB =
  /\b(is|are|was|were|led|peaked|grades|beat|beats|leans|improved|slipped|dropped|gained|stronger|weaker|behind|ahead|rose|fell|has|have|held|shows?)\b/i
/** A verdict on a change, or a result in a label: "No clear change at 20 min", "Best 20 min: 263 W". */
const A_RESULT = /\bno clear change\b|:\s*\d/i
const NAMES_A_WINNER =
  /^(Running|Cycling|Run|Ride)\b.*\b(higher|led|ahead|behind|better|beat|more)\b/i

function titlesOf(element: () => ReactElement): string[] {
  chartWidth(800)
  const { container, unmount } = render(element())
  const titles = Array.from(container.querySelectorAll('figcaption.chart-frame__title'), (node) =>
    (node.textContent ?? '').trim(),
  )
  unmount()
  return titles
}

const allTitles = (): Map<string, string[]> =>
  new Map([
    ...Object.entries(CHARTS).map(([name, elements]): [string, string[]] => [
      name,
      elements.flatMap(titlesOf),
    ]),
    ...Object.entries(PASSED_IN),
  ])

describe('chart titles', () => {
  // The exact title list below is the main guard; the patterns catch a new title that slips past review.
  it('lists every chart component, so a new chart needs an entry here', () => {
    const files = Object.keys(import.meta.glob('./*Chart.tsx')).map((path) =>
      path.replace(/^\.\//, '').replace(/\.tsx$/, ''),
    )
    const listed = new Set([...Object.keys(CHARTS), ...Object.keys(PASSED_IN)])
    expect(files.filter((name) => !listed.has(name))).toEqual([])
  })

  it('has a title for each chart variant', () => {
    for (const [name, titles] of allTitles()) {
      expect(titles.length, name).toBeGreaterThan(0)
      for (const title of titles) expect(title, name).not.toBe('')
    }
  })

  it('never states a conclusion: no sentence, no finite verb, no sport named the winner', () => {
    for (const [name, titles] of allTitles()) {
      for (const title of titles) {
        expect(title, `${name}: ends a sentence`).not.toMatch(/[.!?]$/)
        expect(title, `${name}: has a finite verb`).not.toMatch(FINITE_VERB)
        expect(title, `${name}: states a result`).not.toMatch(A_RESULT)
        expect(title, `${name}: names a winner`).not.toMatch(NAMES_A_WINNER)
      }
    }
  })

  it('reads as a label for what is plotted', () => {
    expect([...allTitles()].flatMap(([, titles]) => titles).sort()).toEqual(
      [
        'Best effort by duration',
        'Best effort by duration',
        'Best effort by duration',
        'Best power by year',
        'Best times by year',
        'Best times by year',
        'Fitness over the years',
        'Fitness over the years',
        'Grade by year, run and ride',
        'Grade by year, run and ride',
        'Hours per year, run and ride',
        'Pace at 150 bpm over time',
        'Power at 140 bpm over time',
        'Run grade by year',
        'Share of the interval in each zone',
        'Share of time in each zone',
      ].sort(),
    )
  })
})

describe('the sentence checks', () => {
  it.each([
    'Running grades higher at every length',
    'Running led every year you did both',
    'Your 20 min pace peaked in 2022',
    'No clear change at 20 min from the previous 12 months',
    'Best 20 min: 263 W.',
  ])('reject %s', (title) => {
    const caught =
      /[.!?]$/.test(title) ||
      FINITE_VERB.test(title) ||
      A_RESULT.test(title) ||
      NAMES_A_WINNER.test(title)
    expect(caught).toBe(true)
  })

  it.each(['Best effort by duration', 'Pace at 150 bpm over time', 'Hours per year, run and ride'])(
    'accept %s',
    (title) => {
      expect(
        /[.!?]$/.test(title) ||
          FINITE_VERB.test(title) ||
          A_RESULT.test(title) ||
          NAMES_A_WINNER.test(title),
      ).toBe(false)
    },
  )
})
