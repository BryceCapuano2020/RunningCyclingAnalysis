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

/** The measures the stack draws, in the order of its rows. */
function rowsOf(figure: HTMLElement): (string | undefined)[] {
  return [...figure.querySelectorAll<HTMLElement>('[data-channel]')].map(
    (row) => row.dataset.channel,
  )
}

describe('ActivityWorkbench', () => {
  it('shows pace, heart rate and power first and keeps the rest to choose', async () => {
    const user = userEvent.setup()
    const loadTrace = vi.fn(
      async () => ({ kind: 'trace', trace: runTrace() }) satisfies ActivityTraceReply,
    )
    render(<ActivityWorkbench activityId="run-1" units="metric" loadTrace={loadTrace} />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading recorded details.')
    const figure = await screen.findByRole('figure', { name: 'Pace and heart rate over time' })
    expect(screen.getByRole('heading', { name: 'In detail' })).toBeInTheDocument()
    expect(rowsOf(figure)).toEqual(['speed', 'heartRate'])
    const cadence = screen.getByRole('checkbox', { name: /Cadence \(steps\/min\)/ })
    expect(cadence).not.toBeChecked()

    await user.click(cadence)
    const three = screen.getByRole('figure', { name: 'Pace, heart rate and cadence over time' })
    expect(rowsOf(three)).toEqual(['speed', 'heartRate', 'cadence'])
    // Choosing a measure back on keeps the list's order, not the order of the clicks.
    await user.click(screen.getByRole('checkbox', { name: /^Pace/ }))
    expect(rowsOf(screen.getByRole('figure'))).toEqual(['heartRate', 'cadence'])
    await user.click(screen.getByRole('checkbox', { name: /^Pace/ }))
    expect(rowsOf(screen.getByRole('figure'))).toEqual(['speed', 'heartRate', 'cadence'])
  })

  it('draws one figure for all the measures, in real proportions and not stretched', async () => {
    show(runTrace())
    const figure = await screen.findByRole('figure')
    expect(screen.getAllByRole('figure')).toHaveLength(1)
    const svg = figure.querySelector('svg.chart-frame__svg')!
    const [, , width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number)
    // One pixel of the drawing is one pixel of the page: the SVG's box is its viewBox.
    expect(svg).toHaveAttribute('width', String(width))
    expect(svg).toHaveAttribute('height', String(height))
    expect(svg).not.toHaveAttribute('preserveAspectRatio')
  })

  it('names the drawing once and labels each measure’s value range', async () => {
    show(runTrace())
    const figure = await screen.findByRole('figure', { name: 'Pace and heart rate over time' })
    const plot = within(figure).getByRole('img', {
      name: /^From 0:00 to 0:10: Pace mostly between/,
    })
    expect(plot).toHaveAccessibleName(
      'From 0:00 to 0:10: Pace mostly between 5:03 /km and 5:33 /km; Heart rate mostly between 120 bpm and 128 bpm',
    )
    expect(plot.querySelector('title')).toBeNull()
    expect(
      [...figure.querySelectorAll('[data-channel="heartRate"] .ts-stack__tick')].map(
        (tick) => tick.textContent,
      ),
    ).toEqual(['122', '124', '126'])
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
    trace.streams.cadence = Float32Array.from({ length: 10 }, (_, i) =>
      i >= 8 ? 170 + i : Number.NaN,
    )
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
    ).toEqual(['Measure', 'Average', 'Typical range', 'Time'])
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

  it('reads the selection’s averages with no cursor, in a row that always holds the same measures', async () => {
    show(runTrace())
    const readout = within(await screen.findByRole('figure')).getByRole('status')
    expect(readout).toHaveTextContent('SelectionAverage')
    expect(readout).toHaveTextContent('Pace5:21/km')
    expect(readout).toHaveTextContent('Heart rate124bpm')
    // The old histograms are gone: the time in zones says how time was spread, with its own table.
    expect(screen.queryByText(/Time at each/)).not.toBeInTheDocument()
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

  it('shows no Laps row for a single recorded lap, which is the whole activity', async () => {
    const trace = runTrace()
    trace.laps = [{ startS: 0, endS: 10 }]
    show(trace)
    await screen.findByText('Elapsed time')
    expect(screen.queryByRole('heading', { name: 'Laps' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Lap 1/ })).not.toBeInTheDocument()
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
    expect(screen.getByRole('slider', { name: 'Selection end' })).toHaveAttribute(
      'aria-valuetext',
      'End 1 min 30 s',
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

  it('moves an end of the brush by keyboard, with named values, and never past the other end', async () => {
    show(steadyTrace(610))
    const start = await screen.findByRole('slider', { name: 'Selection start' })
    fireEvent.keyDown(start, { key: 'ArrowRight' })
    // An arrow moves it a two-hundredth of the activity: three seconds of ten minutes.
    expect(start).toHaveAttribute('aria-valuetext', 'Start 3 s')
    expect(await field('Start time')).toHaveValue('0:03')
    // End jumps to one second short of the other end, at 10:10.
    fireEvent.keyDown(start, { key: 'End' })
    expect(start).toHaveAttribute('aria-valuetext', 'Start 10 min 9 s')
    expect(start).toHaveAttribute('aria-valuenow', '609')
    expect(await field('Start time')).toHaveValue('10:09')
    fireEvent.keyDown(start, { key: 'ArrowRight' })
    expect(start).toHaveAttribute('aria-valuenow', '609')
    const end = screen.getByRole('slider', { name: 'Selection end' })
    expect(end).toHaveAttribute('aria-valuemin', '610')
    fireEvent.keyDown(end, { key: 'Home' })
    expect(end).toHaveAttribute('aria-valuenow', '610')
  })

  it('offers the whole activity back once the brush has moved', async () => {
    const user = userEvent.setup()
    show(steadyTrace(610))
    const start = await screen.findByRole('slider', { name: 'Selection start' })
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()
    fireEvent.keyDown(start, { key: 'ArrowRight' })
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(start).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByRole('slider', { name: 'Selection end' })).toHaveAttribute(
      'aria-valuenow',
      '610',
    )
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
    const table = await screen.findByRole('table', { name: /pace in the selected interval/i })
    const pace = within(table).getByRole('row', { name: /^Pace/ })
    // The one fast second is not the typical range, which is the 5:33 the run held; the average is the distance
    // over the moving time, the standing seconds in it, as the header's is.
    expect(pace).toHaveTextContent('Pace5:39 /km5:33 /km')
    expect(pace).not.toHaveTextContent('—')
    expect(pace).toHaveTextContent(/0:48$/)
    expect(
      await screen.findByText('Stopped or no reading for 12 s of moving time.'),
    ).toBeInTheDocument()
    // Those seconds are a break at the start of the line, not a reading: it begins after the 12th second.
    const figure = screen.getByRole('figure', { name: 'Pace and heart rate over time' })
    const first = /^M ([\d.]+) /.exec(
      figure.querySelector('[data-channel="speed"] .ts-stack__line')?.getAttribute('d') ?? '',
    )
    // The plot is 584 px for 60 s from x = 44, so 12 s is 117 px in.
    expect(Number(first?.[1])).toBeGreaterThan(44 + 100)
  })

  it('puts a run’s faster pace above its slower, and a ride’s higher speed above its lower', async () => {
    /** The tick labels of the speed row, top to bottom, as numbers. */
    const ticksOf = (figure: HTMLElement) =>
      [...figure.querySelectorAll<SVGTextElement>('[data-channel="speed"] .ts-stack__tick')]
        .sort((a, b) => Number(a.getAttribute('y')) - Number(b.getAttribute('y')))
        .map((tick) => Number(tick.textContent?.replace(':', '.')))
    const run = steadyTrace(100, 3)
    run.streams.speed = Float32Array.from({ length: 100 }, (_, index) => 2.5 + index / 100)
    const view = show(run)
    const pace = ticksOf(await screen.findByRole('figure'))
    expect(pace.length).toBeGreaterThan(1)
    expect([...pace].sort((a, b) => a - b)).toEqual(pace)
    view.unmount()

    const ride = steadyTrace(100, 8)
    ride.activityId = 'ride-1'
    ride.sport = 'ride'
    ride.streams.speed = Float32Array.from({ length: 100 }, (_, index) => 5 + index / 20)
    show(ride)
    const speed = ticksOf(await screen.findByRole('figure'))
    expect(speed.length).toBeGreaterThan(1)
    expect([...speed].sort((a, b) => b - a)).toEqual(speed)
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

  it('draws elevation as an area and the other measures as lines with a band', async () => {
    const user = userEvent.setup()
    const trace = runTrace()
    trace.streams.altitude = Float32Array.from({ length: 10 }, (_, index) => 100 + index)
    show(trace)
    const figure = await screen.findByRole('figure')
    // Elevation is on by default where the file has it.
    const elevation = figure.querySelector('[data-channel="altitude"]')!
    expect(elevation.querySelector('.ts-stack__area')?.getAttribute('d')).toMatch(/^M /)
    expect(elevation.querySelector('.ts-stack__band')).toBeNull()
    const heart = figure.querySelector('[data-channel="heartRate"]')!
    expect(heart.querySelector('.ts-stack__band')?.getAttribute('d')).toMatch(/^M /)
    expect(heart.querySelector('.ts-stack__area')).toBeNull()
    await user.click(screen.getByRole('checkbox', { name: /^Elevation/ }))
    expect(rowsOf(screen.getByRole('figure'))).not.toContain('altitude')
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
    expect(await screen.findByRole('figure', { name: /cadence over time$/ })).toBeInTheDocument()
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
    expect(await screen.findByText(/aren't kept on this device/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      "Detailed readings for this activity aren't kept on this device: the browser keeps them for your newest activities, up to its storage limit. Its summary, bests and splits are still here.",
    )
    // Said of what was dropped, not as a fault: it does not tell a person who just imported to import again.
    expect(screen.getByRole('status')).not.toHaveTextContent(/add this activity/i)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    const onAddFiles = vi.fn()
    const offered = render(
      <ActivityWorkbench
        activityId="run-2"
        units="metric"
        loadTrace={loadTrace}
        onAddFiles={onAddFiles}
      />,
    )
    // The file is offered again as a quiet action under the note, which opens the file chooser.
    const again = await screen.findByRole('button', { name: "Add this activity's file again" })
    expect(again).toHaveClass('btn')
    expect(again).not.toHaveClass('btn-primary')
    const file = new File(['x'], 'run.tcx')
    fireEvent.change(offered.container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    })
    expect(onAddFiles).toHaveBeenCalledWith([file])
    offered.unmount()

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
