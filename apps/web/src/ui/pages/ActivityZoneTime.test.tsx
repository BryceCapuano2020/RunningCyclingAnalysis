// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ActivityTrace } from '@rca/core/workbench'
import { zonesFor } from '@rca/core/zones'
import type { ZoneMeasure, ZoneSet } from '@rca/core/zones'
import { ActivityWorkbench } from './ActivityWorkbench'
import { ActivityZoneTime } from './ActivityZoneTime'
import { steadyTrace } from './workbenchFixtures'

afterEach(cleanup)

function setOf(sport: ZoneSet['sport'], measure: ZoneMeasure, reference: number): ZoneSet {
  return {
    sport,
    measure,
    source: 'estimated',
    reference,
    estimatedFrom: [sport],
    maxHeartRateFrom: null,
    asOfMs: null,
    citation: '',
    zones: zonesFor(measure, reference),
  }
}

/** 120 s of a run: a minute at 110 bpm, then a minute at 150 bpm, at 3 m/s. */
function twoPartRun(): ActivityTrace {
  const trace = steadyTrace(120)
  const heartRate = new Float32Array(120).fill(110)
  heartRate.fill(150, 60)
  return { ...trace, streams: { ...trace.streams, heartRate } }
}

const heartRate200 = setOf('run', 'heartRate', 200)
const pace35 = setOf('run', 'pace', 3.5)

function show(
  trace: ActivityTrace,
  sets: ZoneSet[],
  startS = 0,
  endS = trace.durationS,
  heartRateSetAside = false,
) {
  return render(
    <ActivityZoneTime
      trace={trace}
      sets={sets}
      startS={startS}
      endS={endS}
      units="metric"
      heartRateSetAside={heartRateSetAside}
    />,
  )
}

describe('ActivityZoneTime', () => {
  it('leads with pace, then heart rate, and says where most of the interval was', () => {
    show(steadyTrace(120), [heartRate200, pace35])
    expect(screen.getByText('All of this run was in pace zone 2 (100%).')).toBeInTheDocument()
    const bars = screen.getByRole('img')
    expect(bars).toHaveAccessibleName(/Pace: zone 2 100%\. Heart rate: zone 3 100%/)
  })

  it('follows the interval: each part of the run is read in its own zones', () => {
    const trace = twoPartRun()
    const { unmount } = show(trace, [heartRate200], 0, 60)
    expect(screen.getByText('All of this run was in heart rate zone 1 (100%).')).toBeInTheDocument()
    unmount()
    show(trace, [heartRate200], 60, 120)
    expect(screen.getByText('All of this run was in heart rate zone 3 (100%).')).toBeInTheDocument()
  })

  it('says no zone held half when the time is spread', () => {
    show(twoPartRun(), [heartRate200])
    expect(
      screen.getByText('This run spent the most time in heart rate zone 1 (50%).'),
    ).toBeInTheDocument()
  })

  it('keeps every zone, its range and its share in the table behind a disclosure', () => {
    show(twoPartRun(), [heartRate200])
    expect(screen.getByText('View as table')).toBeInTheDocument()
    const table = screen.getByRole('table', { hidden: true })
    expect(within(table).getAllByRole('row', { hidden: true })).toHaveLength(6)
    const row = within(table)
      .getByRole('cell', { name: '140–159 bpm', hidden: true })
      .closest('tr')!
    expect(row).toHaveTextContent('Moderate')
    expect(row).toHaveTextContent('1 min')
    expect(row).toHaveTextContent('50%')
    expect(table.querySelector('caption')).toHaveTextContent('Heart rate zones: from your runs.')
  })

  it('reads a pace range as paces, the fast edge first, in the unit system the page uses', () => {
    show(steadyTrace(120), [pace35])
    expect(
      screen.getByRole('cell', { name: '4:42 /km or faster', hidden: true }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('cell', { name: /^Slower than \d:\d\d \/km$/, hidden: true }),
    ).toBeInTheDocument()
  })

  it('reads a ride by its measured power', () => {
    const trace: ActivityTrace = {
      ...steadyTrace(120),
      sport: 'ride',
      streams: {
        power: new Float32Array(120).fill(190),
        heartRate: new Float32Array(120).fill(120),
      },
    }
    show(trace, [setOf('ride', 'power', 250), setOf('ride', 'heartRate', 190)])
    expect(screen.getByText('All of this ride was in power zone 3 (100%).')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAccessibleName(/Measured power: zone 3 100%/)
  })

  it('asks for a reference when there are no zones', () => {
    show(steadyTrace(120), [])
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '#/profile')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('says so when the interval has no reading to place', () => {
    const trace = { ...steadyTrace(120), streams: {} }
    show(trace, [heartRate200])
    expect(screen.getByText(/No heart rate, power or pace readings/)).toBeInTheDocument()
  })

  it('leaves out a paused second', () => {
    const paused = new Uint8Array(120)
    paused.fill(1, 0, 30)
    show({ ...steadyTrace(120), paused }, [heartRate200])
    expect(screen.getByRole('cell', { name: '1 min 30 s', hidden: true })).toBeInTheDocument()
  })
})

describe('ActivityZoneTime, what it counts and what it says about heart rate', () => {
  it("counts a run's slow seconds in the lowest pace zone, as the digests do", () => {
    const base = steadyTrace(120)
    const speed = new Float32Array(120).fill(3)
    speed.fill(0.2, 0, 30)
    show({ ...base, streams: { speed } }, [pace35])
    expect(screen.getByRole('cell', { name: '30 s', hidden: true })).toBeInTheDocument()
    expect(screen.getByText('Most of this run was in pace zone 2 (75%).')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAccessibleName(/Pace: zone 1 25%, zone 2 75%/)
  })

  it("reads only the zones of the trace's own sport", () => {
    show(steadyTrace(120), [setOf('ride', 'heartRate', 190)])
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('says heart rate was set aside and why, and where the sport’s other zones come from, when none are left', () => {
    show(steadyTrace(120), [], 0, 120, true)
    expect(
      screen.getByText(
        'Heart rate is set aside for this activity: it read too low for the effort, as a working sensor would not, so it is left out of zones.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/^Pace zones use a threshold pace from/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '#/profile')
  })

  it('names power zones for a ride whose heart rate is set aside and whose power zones are missing', () => {
    show({ ...steadyTrace(120), sport: 'ride' }, [], 0, 120, true)
    expect(screen.getByText(/^Power zones use a threshold power from/)).toBeInTheDocument()
  })

  it('says it beside the zones that remain', () => {
    show(steadyTrace(120), [pace35], 0, 120, true)
    expect(screen.getByText('All of this run was in pace zone 2 (100%).')).toBeInTheDocument()
    expect(screen.getByText(/Heart rate is set aside for this activity/)).toBeInTheDocument()
  })
})

describe('ActivityWorkbench zones', () => {
  it('has no zones section unless it is given zone sets', async () => {
    const trace = steadyTrace(120)
    render(
      <ActivityWorkbench
        activityId="run-2"
        units="metric"
        loadTrace={async () => ({ kind: 'trace', trace })}
      />,
    )
    await screen.findByText('Elapsed time')
    expect(screen.queryByRole('heading', { name: 'Time in zones' })).toBeNull()
  })

  it('shows time in zones under the interval summary, for the whole activity at first', async () => {
    const trace = steadyTrace(120)
    render(
      <ActivityWorkbench
        activityId="run-2"
        units="metric"
        loadTrace={async () => ({ kind: 'trace', trace })}
        zoneSets={[pace35]}
      />,
    )
    const heading = await screen.findByRole('heading', { name: 'Time in zones' })
    const summary = screen.getByRole('heading', { name: 'Interval summary' })
    expect(summary.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('All of this run was in pace zone 2 (100%).')).toBeInTheDocument()
  })
})

describe('ActivityZoneTime, a pace the date has no zones for', () => {
  it('says what would give pace zones beside the heart rate time that is left', async () => {
    const trace = twoPartRun()
    render(
      <ActivityWorkbench
        activityId="run-3"
        units="metric"
        loadTrace={async () => ({ kind: 'trace', trace })}
        zoneSets={[setOf('run', 'heartRate', 180)]}
        missingZones={['pace']}
      />,
    )
    await screen.findByRole('heading', { name: 'Time in zones' })
    expect(
      screen.getByText(
        'No pace zones for this run. A hard, even 3–5 min effort and a hard 20 min effort set your pace zones.',
      ),
    ).toBeInTheDocument()
  })
})

describe('ActivityZoneTime, a heart rate the date has no zones for', () => {
  it('says "heart rate", not the measure’s name, and what would give the zones', async () => {
    const trace = twoPartRun()
    render(
      <ActivityWorkbench
        activityId="run-4"
        units="metric"
        loadTrace={async () => ({ kind: 'trace', trace })}
        zoneSets={[setOf('run', 'pace', 3.5)]}
        missingZones={['heartRate']}
      />,
    )
    await screen.findByRole('heading', { name: 'Time in zones' })
    expect(
      screen.getByText(/^No heart rate zones for this run\. None of your efforts reached/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/heartRate/)).toBeNull()
  })
})
