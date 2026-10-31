// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { makeResult } from './components/fixtures'
import { gate, NO_HEART_RATE, THIN, UNKNOWN, withheld } from './effortGateFixtures'
import { ThresholdPanel } from './pages/ThresholdPanel'
import { ThresholdTile } from './pages/ThresholdTile'
import { floorThreshold, withheldFloorLine } from './thresholdFloor'
import { thresholdNeedsLine } from './thresholdNeeds'
import { heldBestHeading, thresholdUncheckedLine, thresholdWithheldLine } from './thresholdWithheld'

afterEach(cleanup)

describe('a threshold the effort gate withheld', () => {
  it('shows the best 30 minutes as a floor in place of the estimate, named for what it is', () => {
    const floor = floorThreshold(withheld(), 'run', 70, 'metric')
    expect(floor?.value).toMatch(/\/km$/)
    expect(floorThreshold(withheld({ floor: null }), 'run', 70, 'metric')).toBeNull()
    expect(heldBestHeading(withheld(), 'run')).toBe('Best 30 min pace')
    expect(
      heldBestHeading(withheld({ floor: { durationS: HEADLINE_DURATION_S, value: 3.4 } }), 'run'),
    ).toBe('Best 20 min pace')
    expect(heldBestHeading(makeResult(), 'run')).toBeNull()
  })

  it('says in the headline of a one-sport page what the held best still shows, as a floor from one effort', () => {
    expect(withheldFloorLine(withheld(), 'run', 70, 'metric')).toMatch(
      /^At least \d+:\d{2} \/km, from one effort\.$/,
    )
    expect(withheldFloorLine(withheld({ floor: null }), 'run', 70, 'metric')).toBeNull()
    expect(withheldFloorLine(makeResult(), 'run', 70, 'metric')).toBeNull()
  })

  it('asks for a harder effort only when the reference can show one hard', () => {
    expect(thresholdWithheldLine(withheld(), 'run')).toBe(
      'Your best 20 min was not a hard effort: it reached 80% of your running reference heart rate, under the 90% that marks a hard effort. A 20 min effort at 90% or more of it would give a threshold.',
    )
  })

  it('asks for the reference to be set or earned when it is too low, with its bpm, or where a typical day is', () => {
    const low = thresholdWithheldLine(
      withheld({ reference: 'low', referenceBpm: 139.4, neededS: null }),
      'run',
    )!
    expect(low).toContain(
      'the highest running heart rate on file, 139 bpm, is too low to be a maximum',
    )
    expect(low).toContain(
      'Set your max heart rate in Profile, or reach hard heart rates on several days.',
    )
    expect(low).not.toContain('A 20 min effort at 90% or more of it would')
    const habitual = thresholdWithheldLine(
      withheld({ reference: 'habitual', neededS: null }),
      'run',
    )!
    expect(habitual).toContain(
      "your running heart rate on file never rises far above a typical day's",
    )
    expect(habitual).toContain('Set your max heart rate in Profile')
  })

  it('says a low cycling reference worked out from running is the running that is low', () => {
    const line = thresholdWithheldLine(
      {
        ...withheld(),
        runCp: null,
        rideCp: null,
        rideCpRefusal: 'effort',
        effortGate: {
          run: UNKNOWN,
          ride: gate({ reference: 'low', referenceFrom: 'run', neededS: null }),
        },
      },
      'ride',
    )!
    expect(line).toContain(
      'the highest heart rate on file for your running, which your cycling reference is worked out from, is too low',
    )
  })

  it('asks a high reference to be confirmed', () => {
    const line = thresholdWithheldLine(
      withheld({ reference: 'high', referenceBpm: 212, neededS: null }),
      'run',
    )!
    expect(line).toContain('is far above the usual maximum for your age')
    expect(line).toContain('If it is right, enter it as your max heart rate in Profile.')
  })

  it('has no line for a threshold that was refused for another reason, or that is there', () => {
    expect(thresholdWithheldLine(makeResult(), 'run')).toBeNull()
    expect(
      thresholdWithheldLine(makeResult({ runCp: null, runCpRefusal: 'shape' }), 'run'),
    ).toBeNull()
    expect(thresholdNeedsLine(withheld(), 'run')).toBe(thresholdWithheldLine(withheld(), 'run'))
  })

  it('says a shown threshold was not checked where there was no heart rate to check it by', () => {
    const noHr = makeResult({ effortGate: { run: NO_HEART_RATE, ride: UNKNOWN } })
    expect(thresholdUncheckedLine(noHr, 'run')).toBe(
      'Effort not checked: no heart rate on your best 20 min run. Add a run with heart rate to check it.',
    )
    const thin = makeResult({ effortGate: { run: THIN, ride: UNKNOWN } })
    expect(thresholdUncheckedLine(thin, 'run')).toContain('too few days with heart rate')
    expect(thresholdUncheckedLine(makeResult(), 'run')).toBeNull()
  })

  it('is drawn on the sport page’s panel as a recorded best, with the reason and no spread or chip', () => {
    const { container } = render(
      <ThresholdPanel
        sport="run"
        result={withheld()}
        massKg={70}
        units="metric"
        rangeDays={null}
      />,
    )
    expect(screen.getByText('Best 30 min pace')).toBeInTheDocument()
    expect(screen.getByText('Recorded')).toBeInTheDocument()
    expect(screen.queryByText('Estimated')).toBeNull()
    expect(container.querySelector('.range-track')).toBeNull()
    expect(container.querySelector('.chip')).toBeNull()
    expect(container.textContent).toContain(
      'A 20 min effort at 90% or more of it would give a threshold.',
    )
    expect(container.querySelector('.sport-hero__number')).not.toBeNull()
  })

  it('is drawn on the tile as a recorded best, with the reason said once', () => {
    const { container } = render(
      <ThresholdTile
        sport="run"
        result={withheld()}
        units="metric"
        massKg={70}
        grade={null}
        weighted
      />,
    )
    expect(screen.getByText('Recorded')).toBeInTheDocument()
    expect(container.querySelector('.range-track')).toBeNull()
    expect(container.querySelector('.stat-tile__effort')).toBeNull()
    expect(
      container.textContent?.match(/A 20 min effort at 90% or more of it would give a threshold/g),
    ).toHaveLength(1)
  })

  it('says a shown threshold was not checked, on the panel and the tile', () => {
    const result = makeResult({ effortGate: { run: NO_HEART_RATE, ride: UNKNOWN } })
    const panel = render(
      <ThresholdPanel sport="run" result={result} massKg={70} units="metric" rangeDays={null} />,
    )
    expect(panel.container.textContent).toContain('Effort not checked: no heart rate')
    cleanup()
    const tile = render(
      <ThresholdTile
        sport="run"
        result={result}
        units="metric"
        massKg={70}
        grade={null}
        weighted
      />,
    )
    expect(tile.container.textContent).toContain('Effort not checked: no heart rate')
  })
})
