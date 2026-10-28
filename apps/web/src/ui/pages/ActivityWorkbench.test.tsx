// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ActivityTrace } from '@rca/core/workbench'
import type { ActivityTraceReply } from '../../worker/protocol'
import { ActivityWorkbench } from './ActivityWorkbench'
import { runTrace, steadyTrace } from './workbenchFixtures'

function show(trace: ActivityTrace, units: 'metric' | 'imperial' = 'metric') {
  return render(
    <ActivityWorkbench
      activityId={trace.activityId}
      units={units}
      loadTrace={async () => ({ kind: 'trace', trace })}
    />,
  )
}

function field(name: string) {
  return screen.findByRole('textbox', { name })
}

describe('ActivityWorkbench', () => {
  it('shows pace, heart rate and power first and keeps the rest to choose', async () => {
    const user = userEvent.setup()
    const loadTrace = vi.fn(
      async () => ({ kind: 'trace', trace: runTrace() }) satisfies ActivityTraceReply,
    )
    render(<ActivityWorkbench activityId="run-1" units="metric" loadTrace={loadTrace} />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading recorded details.')
    expect(await screen.findByRole('figure', { name: /^Pace/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'In detail' })).toBeInTheDocument()
    expect(screen.getByRole('figure', { name: /^Heart rate/ })).toBeInTheDocument()
    expect(screen.queryByRole('figure', { name: /^Cadence/ })).not.toBeInTheDocument()
    const cadence = screen.getByRole('checkbox', { name: /Cadence \(steps\/min\)/ })
    expect(cadence).not.toBeChecked()

    await user.click(cadence)
    expect(screen.getByRole('figure', { name: /^Cadence/ })).toBeInTheDocument()
    // Choosing a measure back on keeps the list's order, not the order of the clicks.
    await user.click(screen.getByRole('checkbox', { name: /^Pace/ }))
    await user.click(screen.getByRole('checkbox', { name: /^Pace/ }))
    const names = screen.getAllByRole('figure').map((figure) => figure.textContent?.split(' (')[0])
    expect(names).toEqual(['Pace', 'Heart rate', 'Cadence'])
  })

  it('names each plot once and labels its value range', async () => {
    show(runTrace())
    const figure = await screen.findByRole('figure', { name: /^Pace/ })
    const plot = within(figure).getByRole('img', { name: /^Pace from 0:00 to 0:10/ })
    expect(plot).toHaveAccessibleName('Pace from 0:00 to 0:10, between 5:03 /km and 5:33 /km')
    expect(plot.querySelector('title')).toBeNull()
    expect(figure).toHaveTextContent('5:03 /km')
    expect(figure).toHaveTextContent('5:33 /km')
    expect(within(figure).getByText('View as table')).toBeInTheDocument()
  })

  it('states paused and unrecorded time only when there is some', async () => {
    const view = show(runTrace())
    expect((await screen.findByText('Paused time')).parentElement).toHaveTextContent('1 s')
    expect(screen.getByText('Unrecorded time').parentElement).toHaveTextContent('1 s')
    expect(screen.getByText('Moving time').parentElement).toHaveTextContent('8 s')
    view.unmount()

    show(steadyTrace(120))
    await screen.findByText('Elapsed time')
    expect(screen.queryByText('Paused time')).not.toBeInTheDocument()
    expect(screen.queryByText('Unrecorded time')).not.toBeInTheDocument()
    expect(screen.queryByText('Moving time')).not.toBeInTheDocument()
  })

  it('lists measures in plain words, and says None in this interval for one with no reading', async () => {
    const trace = runTrace()
    // Cadence is read only in the last seconds, outside the lap.
    trace.streams.cadence = Float32Array.from({ length: 10 }, (_, i) => (i >= 8 ? 170 : Number.NaN))
    show(trace)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /^Lap 1/ }))
    await user.click(await screen.findByRole('checkbox', { name: /^Cadence/ }))
    const table = await screen.findByRole('table', {
      name: /while moving in the selected interval/i,
    })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Measure', 'Average', 'Lowest', 'Highest', 'Time'])
    const cadence = within(table).getByRole('row', { name: /^Cadence/ })
    expect(cadence).toHaveTextContent('None in this interval')
    expect(screen.queryByText(/Not recorded/)).not.toBeInTheDocument()
  })

  it('lists only the measures shown, with each one’s time as a duration', async () => {
    const user = userEvent.setup()
    show(runTrace())
    const table = await screen.findByRole('table', {
      name: /while moving in the selected interval/i,
    })
    expect(within(table).queryByRole('row', { name: /^Cadence/ })).not.toBeInTheDocument()
    expect(within(table).getByRole('row', { name: /^Heart rate/ })).toHaveTextContent(/0:08$/)
    await user.click(screen.getByRole('checkbox', { name: /^Heart rate/ }))
    expect(within(table).queryByRole('row', { name: /^Heart rate/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /^Pace/ }))
    expect(screen.queryByRole('table', { name: /while moving/i })).not.toBeInTheDocument()
  })

  it('titles each histogram by what it counts', async () => {
    show(runTrace())
    const figure = await screen.findByRole('figure', { name: /^Heart rate/ })
    expect(within(figure).getByText('Time at each heart rate')).toBeInTheDocument()
    expect(
      within(await screen.findByRole('figure', { name: /^Pace/ })).getByText('Time at each pace'),
    ).toBeInTheDocument()
  })

  it('reads a lap as a named, marked selection and moves the interval to it', async () => {
    const user = userEvent.setup()
    show(runTrace())
    const lap = await screen.findByRole('button', { name: 'Lap 1 · from 0:02 · 4 s' })
    expect(lap).toHaveAttribute('aria-pressed', 'false')
    await user.click(lap)
    expect(lap).toHaveAttribute('aria-pressed', 'true')
    expect(lap).toHaveClass('activity-workbench__lap--active')
    expect(await field('Start time')).toHaveValue('0:02')
    expect(await field('End time')).toHaveValue('0:06')
    expect(screen.getByText('Elapsed time').parentElement).toHaveTextContent('4 s')
  })

  it('names suggested intervals by number and start instead of repeating one label', async () => {
    const trace = steadyTrace(400)
    trace.streams.power = Float32Array.from({ length: 400 }, (_, index) =>
      Math.floor(index / 100) % 2 === 1 ? 300 : 100,
    )
    show(trace)
    expect(await screen.findByRole('heading', { name: 'Suggested intervals' })).toBeInTheDocument()
    const buttons = screen.getAllByRole('button', { name: /^Interval \d+ · from / })
    expect(buttons.length).toBeGreaterThan(1)
    expect(buttons[0]).toHaveAccessibleName(/^Interval 1 · from \d+:\d{2} · /)
    expect(buttons[1]).toHaveAccessibleName(/^Interval 2 · from \d+:\d{2} · /)
    expect(screen.queryByText(/Inferred interval/)).not.toBeInTheDocument()
  })

  it('does not snap a time while it is typed, and commits it on Enter', async () => {
    const user = userEvent.setup()
    show(steadyTrace(610))
    const end = await field('End time')
    const start = await field('Start time')
    await user.clear(start)
    await user.type(start, '1:00{Enter}')
    expect(start).toHaveValue('1:00')

    await user.clear(end)
    await user.type(end, '9')
    expect(end).toHaveValue('9')
    await user.type(end, '0')
    expect(end).toHaveValue('90')
    await user.keyboard('{Enter}')
    expect(end).toHaveValue('1:30')
    expect(screen.getByRole('slider', { name: 'End time slider' })).toHaveAttribute(
      'aria-valuetext',
      '1 min 30 s',
    )
    expect(screen.getByText('Elapsed time').parentElement).toHaveTextContent('30 s')
  })

  it('refuses a time outside the interval and restores the last one on leaving', async () => {
    const user = userEvent.setup()
    show(steadyTrace(610))
    const end = await field('End time')
    await user.clear(end)
    await user.type(end, '99:00{Enter}')
    expect(end).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a time from 0:01 to 10:10')
    expect(end).toHaveValue('99:00')
    await user.tab()
    expect(end).toHaveValue('10:10')
    expect(end).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('moves an end with its slider and states the time in words', async () => {
    show(steadyTrace(610))
    const slider = await screen.findByRole('slider', { name: 'Start time slider' })
    fireEvent.change(slider, { target: { value: '700' } })
    // The start stops one second short of the end, at 10:10.
    expect(slider).toHaveAttribute('aria-valuetext', '10 min 9 s')
    expect(await field('Start time')).toHaveValue('10:09')
  })

  it('shows an empty recording as having no detailed measures instead of failing', async () => {
    const empty = steadyTrace(0)
    empty.streams = {}
    show(empty)
    expect(
      await screen.findByText('No detailed measures were recorded for this activity.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('leaves out a run’s standing seconds from its pace and says they had no reading', async () => {
    const trace = steadyTrace(60, 3)
    trace.streams.speed!.fill(0.05, 0, 12)
    trace.streams.speed![30] = 3.3
    show(trace)
    const table = await screen.findByRole('table', {
      name: /while moving in the selected interval/i,
    })
    const pace = within(table).getByRole('row', { name: /^Pace/ })
    expect(pace).toHaveTextContent('5:03 /km')
    expect(pace).not.toHaveTextContent('—')
    expect(pace).toHaveTextContent(/0:48$/)
    expect(
      await screen.findByText('Stopped or no reading for 12 s of moving time.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: /^Time at each pace, from 5:03 \/km to 5:33 \/km/ }),
    ).toBeInTheDocument()
  })

  it('orders a run’s pace bins from fastest to slowest and a ride’s speed from lowest to highest', async () => {
    const run = steadyTrace(100, 3)
    run.streams.speed = Float32Array.from({ length: 100 }, (_, index) => 2.5 + index / 100)
    const view = show(run)
    const histogram = await screen.findByRole('img', { name: /^Time at each pace/ })
    const [fastest, slowest] = [/from (\d+:\d+)/, /to (\d+:\d+)/].map(
      (pattern) => pattern.exec(histogram.getAttribute('aria-label') ?? '')?.[1],
    )
    expect(Number(fastest?.replace(':', ''))).toBeLessThan(Number(slowest?.replace(':', '')))
    view.unmount()

    const ride = steadyTrace(100, 8)
    ride.activityId = 'ride-1'
    ride.sport = 'ride'
    ride.streams.speed = Float32Array.from({ length: 100 }, (_, index) => 5 + index / 20)
    show(ride)
    expect(
      await screen.findByRole('img', {
        name: /^Time at each speed, from 18\.0 km\/h to 35\.8 km\/h/,
      }),
    ).toBeInTheDocument()
  })

  it('calls a ride’s missing speed no reading, since only a run has a stop floor', async () => {
    const ride = steadyTrace(60, 8)
    ride.activityId = 'ride-2'
    ride.sport = 'ride'
    ride.streams.speed = Float32Array.from({ length: 60 }, (_, index) =>
      index < 6 ? Number.NaN : 5 + index / 20,
    )
    show(ride)
    expect(await screen.findByText('No reading for 6 s of moving time.')).toBeInTheDocument()
    expect(screen.queryByText(/Stopped or no reading/)).not.toBeInTheDocument()
  })

  it('draws a distribution only for pace, heart rate, power and cadence', async () => {
    const user = userEvent.setup()
    const trace = runTrace()
    trace.streams.altitude = Float32Array.from({ length: 10 }, (_, index) => 100 + index)
    show(trace)
    await user.click(await screen.findByRole('checkbox', { name: /^Elevation/ }))
    const figure = screen.getByRole('figure', { name: /^Elevation/ })
    expect(within(figure).queryByRole('img', { name: /^Time at each/ })).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('figure', { name: /^Heart rate/ })).getByRole('img', {
        name: /^Time at each heart rate/,
      }),
    ).toBeInTheDocument()
  })

  it('says once that readings stay on this device, and keeps the hedging lines out', async () => {
    show(runTrace())
    await screen.findByRole('figure', { name: /^Pace/ })
    expect(screen.getAllByText(/Detailed readings stay on this device/)).toHaveLength(1)
    expect(screen.queryByText(/classifications/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Times are elapsed seconds/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Observed moving/)).not.toBeInTheDocument()
  })

  it('states the unknown cadence unit in one line once cadence is shown', async () => {
    const user = userEvent.setup()
    const unknown = runTrace()
    unknown.cadenceUnit = 'unknown'
    show(unknown)
    const cadence = await screen.findByRole('checkbox', { name: /Cadence \(counts\/min\)/ })
    expect(screen.queryByText(/cadence counts steps or revolutions/)).not.toBeInTheDocument()
    await user.click(cadence)
    expect(
      screen.getByText('This file does not say whether cadence counts steps or revolutions.'),
    ).toBeInTheDocument()
    expect(await screen.findByRole('figure', { name: /^Cadence/ })).toBeInTheDocument()
  })

  it('offers an explicit original read only when the worker reports one is available', async () => {
    const user = userEvent.setup()
    const loadTrace = vi.fn(
      async (_id: string, fromOriginal?: boolean): Promise<ActivityTraceReply> =>
        fromOriginal ? { kind: 'trace', trace: runTrace() } : { kind: 'original' },
    )
    render(<ActivityWorkbench activityId="run-1" units="metric" loadTrace={loadTrace} />)

    await user.click(await screen.findByRole('button', { name: 'Read original file' }))
    await waitFor(() => expect(loadTrace).toHaveBeenLastCalledWith('run-1', true))
    expect(await screen.findByText(/Read from the original file/)).toBeInTheDocument()
  })

  it('explains when details are unavailable and offers retry after a source failure', async () => {
    const loadTrace = vi.fn(async () => ({ kind: 'missing' }) satisfies ActivityTraceReply)
    render(<ActivityWorkbench activityId="run-1" units="metric" loadTrace={loadTrace} />)
    expect(await screen.findByText(/no original file is saved/i)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    const failed = vi.fn(async () => ({ kind: 'failed' }) satisfies ActivityTraceReply)
    const view = render(<ActivityWorkbench activityId="run-1" units="metric" loadTrace={failed} />)
    await screen.findByRole('button', { name: 'Try again' })
    await act(async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    })
    expect(failed).toHaveBeenCalledTimes(2)
    view.unmount()
  })
})
