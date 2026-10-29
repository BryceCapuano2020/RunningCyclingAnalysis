// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NO_HEART_RATE_JUDGEMENT } from '@rca/core/digest/setAsideTypes'
import type { DigestSplits } from '@rca/core/types'
import type { ActivityTrace } from '@rca/core/workbench'
import type { ActivityTraceReply } from '../../worker/protocol'
import { runCurveFixture, rideCurveFixture } from '../charts/fixtures'
import { MAN_BORN_1986, makeActivity, makeResult } from '../components/fixtures'
import { FLAT_PACE_NOTE } from '../grades'
import type { RouteReply } from '../routeReply'
import { SETTLE_MS } from '../useSplitsView'
import { ActivityPage } from './ActivityPage'
import { repsTrace } from './workbenchFixtures'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** The library's bests are set by the activity whose id is 'activity-1', and carry a Flat mark. */
const run = makeActivity({ id: 'activity-1', name: 'Reps', sport: 'run', distanceM: 1200 })
const other = makeActivity({ id: 'activity-2', name: 'Strides', sport: 'run', distanceM: 1200 })

/** A kilometre whose flat pace differs from its pace, so the splits show a flat pace column. */
const splits: DigestSplits = {
  km: [
    {
      distanceM: 1000,
      seconds: 300,
      gradeAdjustedSeconds: 290,
      elevationGainM: 0,
      avgHeartRate: 150,
    },
  ],
  mile: [],
}

/** A trace of two stretches with the laps given, owned by the run. */
function traceWith(laps: [number, number][], id: string = run.id): ActivityTrace {
  const trace = repsTrace(
    'run',
    [
      { seconds: 60, speed: 3, heartRate: 150 },
      { seconds: 90, speed: 3, heartRate: 160 },
    ],
    laps,
  )
  return { ...trace, activityId: id }
}

const UNEVEN: [number, number][] = [
  [0, 60],
  [60, 150],
]

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

type LoadTrace = (id: string, fromOriginal?: boolean) => Promise<ActivityTraceReply>

/** The page for `activity`, whose own bests are the library's when it is the first run. */
function pageFor(activity: typeof run, loadTrace: LoadTrace) {
  const result = makeResult({ runCurve: runCurveFixture, rideCurve: rideCurveFixture })
  return (
    <ActivityPage
      signedIn={false}
      activity={activity}
      library={[run, other]}
      result={{ ...result, activities: [run, other] }}
      zoneEstimates={null}
      units="metric"
      massKg={70}
      weightKnown
      heartRateJudgement={NO_HEART_RATE_JUDGEMENT}
      profile={MAN_BORN_1986}
      records={new Map()}
      loadSplits={vi.fn(async () => splits)}
      loadTrace={loadTrace}
      routeId={null}
      loadRoute={async (): Promise<RouteReply> => ({ kind: 'none' })}
    />
  )
}

function renderPage(loadTrace: LoadTrace) {
  return render(pageFor(run, loadTrace))
}

/** A loader whose trace for each run carries the laps given for it, owned by the run asked for. */
const withTrace =
  (laps: [number, number][]): LoadTrace =>
  async (id) => ({ kind: 'trace', trace: traceWith(laps, id) })

function splitsSection(): HTMLElement {
  const section = screen.getByRole('heading', { level: 2, name: 'Splits' }).closest('section')
  if (!section) throw new Error('No Splits section')
  return section
}

function bestsSection(): HTMLElement {
  const section = screen
    .getByRole('heading', { level: 2, name: 'Best efforts set here' })
    .closest('section')
  if (!section) throw new Error('No Best efforts section')
  return section
}

describe('ActivityPage: laps as splits', () => {
  it("leads with the device's uneven laps, beside the kilometres, once the recorded detail has loaded", async () => {
    renderPage(withTrace(UNEVEN))
    expect(await screen.findByRole('button', { name: 'Laps', pressed: true })).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Pace for each lap the device recorded' })
    expect(within(table).getAllByRole('row')).toHaveLength(3)
  })

  it('offers no laps view when the device recorded none', async () => {
    renderPage(withTrace([]))
    await screen.findByText('Interval summary')
    expect(screen.getByRole('table', { name: 'Pace for each kilometre' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Laps' })).not.toBeInTheDocument()
  })

  it('offers equal laps that are not a mile or a kilometre', async () => {
    renderPage(
      withTrace([
        [0, 50],
        [50, 100],
        [100, 150],
      ]),
    )
    // The trace's 3 m/s makes these 150 m laps, which are neither a mile nor a kilometre.
    expect(await screen.findByRole('button', { name: 'Laps', pressed: true })).toBeInTheDocument()
  })
})

describe('ActivityPage: the flat pace note with laps open', () => {
  it('sits under the best efforts while the laps are open, and moves under the splits with the kilometres', async () => {
    renderPage(withTrace(UNEVEN))
    await screen.findByRole('button', { name: 'Laps', pressed: true })

    expect(await within(bestsSection()).findByText(FLAT_PACE_NOTE)).toBeInTheDocument()
    expect(within(splitsSection()).queryByText(FLAT_PACE_NOTE)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Kilometres' }))
    expect(within(splitsSection()).getByText(FLAT_PACE_NOTE)).toBeInTheDocument()
    expect(within(bestsSection()).queryByText(FLAT_PACE_NOTE)).not.toBeInTheDocument()
  })
})

describe('ActivityPage: choosing the view once the detail settles', () => {
  it('shows the kilometres until the trace arrives, then opens on the laps if it arrives in time', async () => {
    const trace = deferred<ActivityTraceReply>()
    renderPage(() => trace.promise)
    expect(
      await screen.findByRole('table', { name: 'Pace for each kilometre' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Laps' })).not.toBeInTheDocument()
    await act(async () => trace.resolve({ kind: 'trace', trace: traceWith(UNEVEN) }))
    expect(await screen.findByRole('button', { name: 'Laps', pressed: true })).toBeInTheDocument()
  })

  it('stays on the kilometres when the trace arrives after the wait, and only offers the laps', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const trace = deferred<ActivityTraceReply>()
    renderPage(() => trace.promise)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SETTLE_MS + 10)
    })
    expect(screen.getByRole('table', { name: 'Pace for each kilometre' })).toBeInTheDocument()
    await act(async () => trace.resolve({ kind: 'trace', trace: traceWith(UNEVEN) }))
    const laps = screen.getByRole('button', { name: 'Laps' })
    expect(laps).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('table', { name: 'Pace for each kilometre' })).toBeInTheDocument()
  })

  it('opens the next run on its own laps, though the last run settled on the kilometres', async () => {
    // The page is reused from one activity to the next, so the first run's settled detail must not
    // decide the second's view.
    const loadTrace: LoadTrace = async (id) => ({
      kind: 'trace',
      trace: traceWith(id === run.id ? [] : UNEVEN, id),
    })
    const { rerender } = renderPage(loadTrace)
    await screen.findByText('Interval summary')
    expect(screen.queryByRole('button', { name: 'Laps' })).not.toBeInTheDocument()
    rerender(pageFor(other, loadTrace))
    expect(await screen.findByRole('button', { name: 'Laps', pressed: true })).toBeInTheDocument()
  })

  it('stays on the kilometres when the original file is read later, and offers the laps', async () => {
    const loadTrace = vi.fn(
      async (_id: string, fromOriginal?: boolean): Promise<ActivityTraceReply> =>
        fromOriginal ? { kind: 'trace', trace: traceWith(UNEVEN) } : { kind: 'original' },
    )
    renderPage(loadTrace)
    await userEvent.click(await screen.findByRole('button', { name: 'Read original file' }))
    const laps = await screen.findByRole('button', { name: 'Laps' })
    expect(laps).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('table', { name: 'Pace for each kilometre' })).toBeInTheDocument()
    await userEvent.click(laps)
    await waitFor(() => expect(laps).toHaveAttribute('aria-pressed', 'true'))
  })
})
