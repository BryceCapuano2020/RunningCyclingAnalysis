// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { EffortGate } from '@rca/core/effort'
import type { AnalysisResult } from '@rca/core/pipeline'
import { curvePoint } from './charts/fixtures'
import { makeActivity, makeResult } from './components/fixtures'
import { heldAction, heldReason } from './components/headlineNeed'
import { headlinePick } from './components/pickHeadline'
import { effortCaveat, effortChipText } from './effortCaveat'
import { racePredictionNeed, racePredictionsOf } from './racePredictions'
import { ThresholdPanel } from './pages/ThresholdPanel'
import { ThresholdTile } from './pages/ThresholdTile'
import { floorThreshold } from './thresholdFloor'
import { thresholdNeedsLine } from './thresholdNeeds'
import { thresholdWithheldLine } from './thresholdWithheld'

afterEach(cleanup)

const gate = (over: Partial<EffortGate> = {}): EffortGate => ({
  verdict: 'notHard',
  share: 0.8,
  reference: 'trusted',
  floor: 3.4,
  neededS: HEADLINE_DURATION_S,
  ...over,
})

/** A result whose run threshold the effort gate withheld, with the best 20 minutes as its floor. */
const withheld = (over: Partial<EffortGate> = {}, refs: Partial<AnalysisResult> = {}) =>
  makeResult({
    runCp: null,
    runCpRefusal: 'effort',
    runMaxHeartRate: 186,
    effortGate: { run: gate(over), ride: gate({ verdict: 'unknown', share: null, floor: null }) },
    ...refs,
  })

describe('the chip when the reference cannot show an effort was hard', () => {
  const check = (reference: 'trusted' | 'low' | 'habitual') => ({
    durationS: HEADLINE_DURATION_S,
    runHrFraction: 0.98,
    rideHrFraction: null,
    runReference: reference,
    rideReference: null,
  })

  it('says a share of a trusted reference as before', () => {
    expect(effortChipText('run', check('trusted'))).toMatchObject({
      hard: true,
      label: 'Hard effort · 98%',
    })
  })

  it('does not call a best hard, or print its share, when the reference is low or where the typical day is', () => {
    for (const reference of ['low', 'habitual'] as const) {
      const chip = effortChipText('run', check(reference))!
      expect(chip.hard).toBe(false)
      expect(chip.label).toBe('Effort not confirmed')
      expect(chip.detail).toContain('cannot show your best 20 min was hard')
      expect(chip.detail).not.toContain('98%')
    }
  })

  it('gives the share card a line that heart rate does not show the efforts were hard', () => {
    expect(effortCaveat(check('low'))?.short).toBe(
      'Heart rate does not show the best efforts over 20 min were hard.',
    )
    expect(effortCaveat(check('trusted'))).toBeNull()
  })
})

describe('a threshold the effort gate withheld', () => {
  it('shows the best 20 minutes as a floor in place of the estimate', () => {
    const floor = floorThreshold(withheld(), 'run', 70, 'metric')
    expect(floor?.value).toMatch(/\/km$/)
    // The same figure as a floor of the same flat speed would give: it is the gate's floor, 3.4 W/kg.
    expect(floor).toEqual(floorThreshold(withheld({ floor: 3.4 }), 'run', 70, 'metric'))
    expect(floorThreshold(withheld({ floor: null }), 'run', 70, 'metric')).toBeNull()
  })

  it('names what the best 20 minutes reached and the effort that would give a threshold', () => {
    expect(thresholdWithheldLine(withheld(), 'run')).toBe(
      'Your best 20 min was not shown to be a hard effort: it reached 80% of your running reference heart rate. A hard 20 min effort would give a threshold.',
    )
  })

  it('says the reference is too low, with its bpm, or where a typical day is', () => {
    expect(
      thresholdWithheldLine(withheld({ reference: 'low' }, { runMaxHeartRate: 139.4 }), 'run'),
    ).toContain('the highest running heart rate on file, 139 bpm, is too low to be a maximum')
    expect(thresholdWithheldLine(withheld({ reference: 'habitual' }), 'run')).toContain(
      "your running heart rate on file never rises far above a typical day's",
    )
  })

  it('has no line for a threshold that was refused for another reason, or that is there', () => {
    expect(thresholdWithheldLine(makeResult(), 'run')).toBeNull()
    expect(
      thresholdWithheldLine(makeResult({ runCp: null, runCpRefusal: 'shape' }), 'run'),
    ).toBeNull()
    expect(thresholdNeedsLine(withheld(), 'run')).toBe(thresholdWithheldLine(withheld(), 'run'))
  })

  it('is drawn on the sport page’s panel as At least, with the reason, and no spread', () => {
    const { container } = render(
      <ThresholdPanel
        sport="run"
        result={withheld()}
        massKg={70}
        units="metric"
        rangeDays={null}
      />,
    )
    expect(screen.getByText('At least')).toBeInTheDocument()
    expect(screen.queryByText('Estimated')).toBeNull()
    expect(container.querySelector('.range-track')).toBeNull()
    expect(container.textContent).toContain('A hard 20 min effort would give a threshold.')
    expect(container.querySelector('.sport-hero__number')).not.toBeNull()
  })

  it('is drawn on the tile as At least, with the reason', () => {
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
    expect(screen.getByText('At least')).toBeInTheDocument()
    expect(container.querySelector('.range-track')).toBeNull()
    expect(container.textContent).toContain('A hard 20 min effort would give a threshold.')
  })
})

describe('the Balance headline and the effort gate', () => {
  const curve = [curvePoint(1200, 5, 'a')]
  const three = (sport: 'run' | 'ride') =>
    Array.from({ length: 3 }, (_, n) => makeActivity({ id: `${sport}-${n}`, sport }))
  const base = (run: EffortGate, ride: EffortGate) =>
    makeResult({
      activities: [...three('run'), ...three('ride')],
      runCurve: curve,
      rideCurve: curve,
      effortGate: { run, ride },
    })
  const hard = gate({ verdict: 'hard', share: 0.95 })

  it('compares the sports when neither best 20 minutes was shown easy', () => {
    expect(headlinePick(base(hard, hard))).not.toBeNull()
    expect(headlinePick(base(gate({ verdict: 'unknown', share: null }), hard))).not.toBeNull()
  })

  it('holds the headline when a sport’s best 20 minutes was not a hard effort, even with a threshold', () => {
    const held = base(gate(), hard)
    expect(headlinePick(held)).toBeNull()
    const fitted = { ...held, runCp: makeResult().runCp }
    expect(headlinePick(fitted)).toBeNull()
  })

  it('names the sport and the effort that would lift the hold', () => {
    const run = base(gate(), hard)
    expect(heldReason(run, undefined)).toBe('A hard 20 min run would let them be compared.')
    expect(heldAction(run, undefined)).toBe('A hard 20 min run would let them be compared.')
    const both = base(gate(), gate())
    expect(heldReason(both, undefined)).toBe(
      'A hard 20 min run and a hard ride would let them be compared.',
    )
  })
})

describe('race predictions and the effort gate', () => {
  const bests = [
    { distanceM: 5000, seconds: 21 * 60 },
    { distanceM: 10000, seconds: 44 * 60 },
  ]
  const run = (id: string, maxHeartRate: number | null) =>
    makeActivity({ id, sport: 'run', distanceM: 10_000, distanceBests: bests, maxHeartRate })
  const result = (
    activities: ReturnType<typeof run>[],
    reference: 'trusted' | 'low' | 'habitual' = 'trusted',
  ) =>
    makeResult({
      activities,
      runMaxHeartRate: 190,
      effortGate: { run: gate({ reference }), ride: gate({ verdict: 'unknown' }) },
    })

  it('carries the bests of a run that reached a hard heart rate to a race', () => {
    expect(racePredictionsOf('run', result([run('hard', 180)]))?.races.length).toBeGreaterThan(0)
  })

  it('does not carry the easy pace of a run whose peak heart rate was easy', () => {
    expect(racePredictionsOf('run', result([run('easy', 140)]))).toBeNull()
    expect(racePredictionNeed('run', result([run('easy', 140)]))).toBe(
      'Needs a hard run. Your runs on file never reached a hard heart rate, so their times are not carried to a race',
    )
  })

  it('keeps the hard run’s bests among easy ones, and a run with no heart rate', () => {
    const mixed = racePredictionsOf('run', result([run('easy', 140), run('hard', 180)]))
    const hardOnly = racePredictionsOf('run', result([run('hard', 180)]))
    // The marathon also reads weekly volume, which counts every run; the shorter races read the bests alone.
    expect(mixed?.races.slice(0, 3)).toEqual(hardOnly?.races.slice(0, 3))
    expect(mixed?.runsVdot).toBe(hardOnly?.runsVdot)
    expect(racePredictionsOf('run', result([run('bare', null)]))).not.toBeNull()
  })

  it('shows no run hard against a reference that cannot be trusted', () => {
    expect(racePredictionsOf('run', result([run('a', 190)], 'habitual'))).toBeNull()
  })

  it('keeps the usual need where no run holds a best', () => {
    expect(racePredictionNeed('run', result([]))).toBe(
      'Needs a best of a mile or more, or runs with heart rate',
    )
  })
})
