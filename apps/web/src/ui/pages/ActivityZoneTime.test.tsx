// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ActivityTrace } from '@rca/core/workbench'
import { zonesFor } from '@rca/core/zones'
import type { ZoneMeasure, ZoneSet } from '@rca/core/zones'
import { ActivityWorkbench } from './ActivityWorkbench'
import { ActivityZoneTime } from './ActivityZoneTime'
import { steadyTrace } from './test/workbenchFixtures'

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
    windowEndMs: null,
    fromHighest: false,
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
  it('leads with pace, then heart rate, each with its share by zone', () => {
    show(steadyTrace(120), [heartRate200, pace35])
    expect(screen.queryByText('Most time')).toBeNull()
    const bars = screen.getByRole('img')
    expect(bars).toHaveAccessibleName(/Pace: zone 2 100%\. Heart rate: zone 3 100%/)
  })

  it('follows the interval: each part of the run is read in its own zones', () => {
    const trace = twoPartRun()
    const { unmount } = show(trace, [heartRate200], 0, 60)
    expect(screen.getByRole('img')).toHaveAccessibleName(/Heart rate: zone 1 100%/)
    unmount()
    show(trace, [heartRate200], 60, 120)
    expect(screen.getByRole('img')).toHaveAccessibleName(/Heart rate: zone 3 100%/)
  })

  it('splits the shares when the time is spread over zones', () => {
    show(twoPartRun(), [heartRate200])
    expect(screen.getByRole('img')).toHaveAccessibleName(/Heart rate: zone 1 50%, zone 3 50%/)
  })

  it('keeps every zone, its range and its share in the table', () => {
    show(twoPartRun(), [heartRate200])
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
    expect(screen.getByRole('img')).toHaveAccessibleName(/Measured power: zone 3 100%/)
  })

  it('names the heading and links to Profile when there are no zones', () => {
    show(steadyTrace(120), [])
    expect(screen.getByRole('heading', { name: 'Time in zones' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Set your zones on Profile' })).toHaveAttribute(
      'href',
      '#/profile',
    )
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('draws nothing when zones exist but the interval has no reading to place', () => {
    const trace = { ...steadyTrace(120), streams: {} }
    const { container } = show(trace, [heartRate200])
    expect(container).toBeEmptyDOMElement()
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
    expect(screen.getByRole('img')).toHaveAccessibleName(/Pace: zone 1 25%, zone 2 75%/)
  })

  it("reads only the zones of the trace's own sport", () => {
    show(steadyTrace(120), [setOf('ride', 'heartRate', 190)])
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('says heart rate was set aside in one line, and links to Profile when no zones are left', () => {
    show(steadyTrace(120), [], 0, 120, true)
    expect(screen.getByText('Heart rate set aside')).toBeInTheDocument()
    expect(screen.queryByText(/read too low/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Set your zones on Profile' })).toHaveAttribute(
      'href',
      '#/profile',
    )
  })

  it('says it beside the zones that remain, with no link to Profile', () => {
    show(steadyTrace(120), [pace35], 0, 120, true)
    expect(screen.getByRole('img')).toHaveAccessibleName(/Pace: zone 2 100%/)
    expect(screen.getByText('Heart rate set aside')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('says only the set-aside line when the interval has no reading', () => {
    const trace = { ...steadyTrace(120), streams: {} }
    show(trace, [pace35], 0, 120, true)
    expect(screen.getByText('Heart rate set aside')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
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
    await screen.findAllByRole('img')
    expect(screen.queryByRole('heading', { name: 'Time in zones' })).toBeNull()
  })

  it('shows time in zones for the whole activity at first', async () => {
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
    expect(within(heading.parentElement!).getByRole('img')).toHaveAccessibleName(
      /Pace: zone 2 100%/,
    )
  })
})

describe('ActivityZoneTime, a pace the date has no zones for', () => {
  it('links to Profile beside the heart rate time that is left', async () => {
    const trace = twoPartRun()
    render(
      <ActivityWorkbench
        activityId="run-3"
        units="metric"
        loadTrace={async () => ({ kind: 'trace', trace })}
        zoneSets={[setOf('run', 'heartRate', 180)]}
        missingZones={[{ measure: 'pace' }]}
      />,
    )
    const heading = await screen.findByRole('heading', { name: 'Time in zones' })
    expect(within(heading.parentElement!).getByRole('img')).toHaveAccessibleName(/Heart rate: zone/)
    expect(screen.getByRole('link', { name: 'Set your zones on Profile' })).toHaveAttribute(
      'href',
      '#/profile',
    )
    expect(screen.queryByText(/No pace zones/)).toBeNull()
  })
})

describe('ActivityZoneTime, a heart rate the date has no zones for', () => {
  it('links to Profile for the heart rate zones it lacks, without the measure’s name', async () => {
    const trace = twoPartRun()
    render(
      <ActivityWorkbench
        activityId="run-4"
        units="metric"
        loadTrace={async () => ({ kind: 'trace', trace })}
        zoneSets={[setOf('run', 'pace', 3.5)]}
        missingZones={[{ measure: 'heartRate' }]}
      />,
    )
    await screen.findByRole('heading', { name: 'Time in zones' })
    expect(screen.getByRole('link', { name: 'Set your zones on Profile' })).toBeInTheDocument()
    expect(screen.queryByText(/No heart rate zones/)).toBeNull()
    expect(screen.queryByText(/heartRate/)).toBeNull()
  })
})
