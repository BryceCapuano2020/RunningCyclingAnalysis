// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Measurement } from '@rca/core/athlete'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import { NO_HEART_RATE_JUDGEMENT } from '@rca/core/digest/setAsideTypes'
import type { HeartRateJudgement } from '@rca/core/digest/setAsideTypes'
import type { AthleteSettings } from '@rca/core/types'
import { MAN_BORN_1986, makeActivity, makeResult } from '../components/fixtures'
import type { RouteReply } from '../routeReply'
import { ActivityPage } from './ActivityPage'
import { steadyTrace } from './workbenchFixtures'

afterEach(cleanup)

const settings = (measurements: Measurement[] = []): AthleteSettings => ({
  massKg: 70,
  bikeMassKg: 9,
  measurements,
})

/** A library judgement that sets these aside, against a reference of 190 bpm. */
const judgement = (setAside: readonly string[]): HeartRateJudgement => ({
  ...NO_HEART_RATE_JUDGEMENT,
  setAside,
  referenceHr: { run: 190, ride: 190 },
})

function show(
  activity: ActivitySummary,
  result: AnalysisResult,
  athlete: AthleteSettings | undefined,
  weightKnown = true,
  setAside: readonly string[] = [],
) {
  const trace = { ...steadyTrace(120), activityId: activity.id, sport: activity.sport }
  return render(
    <ActivityPage
      signedIn={false}
      activity={activity}
      library={[activity]}
      result={{ ...result, activities: [activity] }}
      zoneEstimates={result}
      units="metric"
      massKg={70}
      settings={athlete}
      weightKnown={weightKnown}
      heartRateJudgement={judgement(setAside)}
      profile={MAN_BORN_1986}
      records={new Map()}
      loadSplits={vi.fn(async () => null)}
      loadTrace={async () => ({ kind: 'trace', trace })}
      routeId={null}
      loadRoute={async (): Promise<RouteReply> => ({ kind: 'none' })}
    />,
  )
}

describe('the activity page zones', () => {
  it("cuts the interval by the zones in effect on the activity's day", async () => {
    const run = makeActivity({ id: 'run-a', startMs: new Date(2026, 1, 10, 12).getTime() })
    const entries: Measurement[] = [
      { kind: 'maxHeartRate', sport: 'run', value: 230, from: '2026-01-01' },
      { kind: 'maxHeartRate', sport: 'run', value: 150, from: '2026-03-01' },
    ]
    show(run, makeResult({ runCp: null }), settings(entries))
    // 140 bpm of 230 is 61% (zone 2), the maximum in effect on 10 February; of 150 it would be 93% (zone 5).
    expect(await screen.findByText(/in heart rate zone 2 \(100%\)/)).toBeInTheDocument()
  })

  it("reads the estimate of the analysis when nothing is entered, and says it is the app's", async () => {
    const run = makeActivity({ id: 'run-b' })
    show(
      run,
      makeResult({ runCp: null, runMaxHeartRate: 200, runObservedMaxHeartRate: 200 }),
      settings(),
    )
    expect(await screen.findByText(/in heart rate zone 3 \(100%\)/)).toBeInTheDocument()
  })

  it('uses the set-aside of the whole library when the page is given it, for an activity the period does not hold', async () => {
    const run = makeActivity({ id: 'run-e' })
    // The period's analysis sets nothing aside; the library's does.
    show(run, makeResult({ runCp: null, runMaxHeartRate: 200 }), settings(), true, ['run-e'])
    expect(
      await screen.findByText(
        'Heart rate is set aside for this activity: it read too low for the effort, as a working sensor would not, so it is left out of zones.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/heart rate zone/)).toBeNull()
  })

  it('says why in the data note, citing the reference the library was judged against', async () => {
    const run = makeActivity({ id: 'run-c' })
    show(run, makeResult({ runCp: null, runMaxHeartRate: 200 }), settings(), true, ['run-c'])
    expect(
      await screen.findByText(/across all your activities \(190 bpm running\)/),
    ).toBeInTheDocument()
  })

  it('does not read the period’s own list: the library’s is the judgement', async () => {
    const run = makeActivity({ id: 'run-f' })
    // The period's analysis lists the run, but the library's judgement does not.
    show(
      run,
      makeResult({ runCp: null, heartRateSetAside: ['run-f'], runMaxHeartRate: 200 }),
      settings(),
    )
    expect(await screen.findByText(/in heart rate zone \d \(100%\)/)).toBeInTheDocument()
  })

  describe("a ride's estimated power zones", () => {
    const showRide = (weightKnown: boolean) => {
      const ride = makeActivity({ id: 'ride-a', sport: 'ride', powerSource: 'measured' })
      const trace = {
        ...steadyTrace(120),
        activityId: 'ride-a',
        sport: 'ride' as const,
        streams: { power: new Float32Array(120).fill(150) },
      }
      return render(
        <ActivityPage
          signedIn={false}
          activity={ride}
          library={[ride]}
          result={{ ...makeResult({ rideMaxHeartRate: null }), activities: [ride] }}
          zoneEstimates={makeResult({ rideMaxHeartRate: null })}
          units="metric"
          massKg={70}
          settings={settings()}
          weightKnown={weightKnown}
          heartRateJudgement={NO_HEART_RATE_JUDGEMENT}
          profile={MAN_BORN_1986}
          records={new Map()}
          loadSplits={vi.fn(async () => null)}
          loadTrace={async () => ({ kind: 'trace', trace })}
          routeId={null}
          loadRoute={async (): Promise<RouteReply> => ({ kind: 'none' })}
        />,
      )
    }

    it('wait for the body weight, as they do on Profile', async () => {
      showRide(false)
      await screen.findByText('Elapsed time')
      expect(screen.queryByText(/power zone/)).toBeNull()
    })

    it('show once the weight is entered', async () => {
      showRide(true)
      expect(await screen.findByText(/in power zone \d \(100%\)/)).toBeInTheDocument()
    })
  })

  it('has no zones section when the page is not given the settings', async () => {
    show(makeActivity({ id: 'run-d' }), makeResult(), undefined)
    await screen.findByText('Elapsed time')
    expect(screen.queryByRole('heading', { name: 'Time in zones' })).toBeNull()
  })
})
