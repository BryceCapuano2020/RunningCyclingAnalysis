// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ActivityTrace } from '@rca/core/workbench'
import type { ActivityTraceReply } from '../../worker/workbench'
import { ActivityWorkbench } from './ActivityWorkbench'
import { downsampleActivityTrace } from './workbenchDownsample'
import { displayValue, metricUnit } from './workbenchFormat'

function trace(): ActivityTrace {
  return {
    version: 1,
    activityId: 'run-1',
    sport: 'run',
    durationS: 10,
    distance: Float64Array.from([0, 3, 6, 9, 12, 15, 18, 21, 24, 27]),
    paused: Uint8Array.from([0, 0, 1, 0, 0, 0, 0, 0, 0, 0]),
    unrecorded: Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]),
    streams: {
      speed: Float32Array.from([3, 3, 3.1, 3.2, 3.1, 3, 3.2, 3.3, Number.NaN, 3.1]),
      heartRate: Float32Array.from([120, 121, 122, 123, 124, 125, 126, 127, 128, 129]),
      cadence: Float32Array.from([170, 171, 172, 173, 174, 175, 176, 177, 178, 179]),
    },
    laps: [{ startS: 2, endS: 6, label: 'Recorded lap' }],
  }
}

describe('ActivityWorkbench', () => {
  it('loads synchronized measures and updates the interval summary from keyboard controls', async () => {
    const user = userEvent.setup()
    const loadTrace = vi.fn(
      async () => ({ kind: 'trace', trace: trace() }) satisfies ActivityTraceReply,
    )
    render(<ActivityWorkbench activityId="run-1" units="metric" loadTrace={loadTrace} />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading recorded details.')
    const recordedLap = await screen.findByRole('button', { name: /Recorded lap/ })
    expect(
      await screen.findByRole('img', { name: 'Pace during selected moving time' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('img', { name: 'Heart rate during selected moving time' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('table', { name: /measure statistics during moving time/i }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(/Observed moving range: 5:03 \/km to 5:33 \/km/),
    ).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Cadence \(steps\/min\)/ })).toBeInTheDocument()
    expect(screen.getByText('Paused time')).toBeInTheDocument()
    expect(screen.getByText('Unrecorded time')).toBeInTheDocument()
    expect(screen.getByText('Paused time').parentElement).toHaveTextContent('1 s')
    expect(screen.getByText('Unrecorded time').parentElement).toHaveTextContent('1 s')
    await user.click(screen.getByText('Observed moving distribution for pace'))
    expect(screen.getByRole('row', { name: /No valid value while moving 1/ })).toBeInTheDocument()

    recordedLap.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByText(/2 s.*6 s selected/)).toBeInTheDocument())
    expect(recordedLap).toHaveAttribute('aria-pressed', 'true')
  })

  it('labels run and ride cadence in their normalized units', () => {
    expect(metricUnit('cadence', 'run', 'metric')).toBe('steps/min')
    expect(metricUnit('cadence', 'ride', 'metric')).toBe('rev/min')
    expect(metricUnit('cadence', 'run', 'metric', 'unknown')).toBe('counts/min')
    expect(displayValue('cadence', 176.4, 'run', 'metric', 'unknown')).toBe('176 counts/min')
  })

  it('rounds fractional time bounds and safely ignores non-finite numeric input', async () => {
    render(
      <ActivityWorkbench
        activityId="run-1"
        units="metric"
        loadTrace={async () => ({ kind: 'trace', trace: trace() })}
      />,
    )
    const start = await screen.findByRole('spinbutton', {
      name: 'Selected interval start time in seconds',
    })
    const end = screen.getByRole('spinbutton', { name: 'Selected interval end time in seconds' })
    fireEvent.change(start, { target: { value: '1.5' } })
    expect(await screen.findByText('2 s–10 s selected')).toBeInTheDocument()
    fireEvent.change(end, { target: { value: '8.5' } })
    expect(await screen.findByText('2 s–9 s selected')).toBeInTheDocument()
    fireEvent.change(start, { target: { value: '' } })
    expect(screen.getByText('2 s–9 s selected')).toBeInTheDocument()
  })

  it('keeps multi-gap buckets disconnected while bounding plotted points', () => {
    const stream = new Float32Array(10_000).fill(2)
    const item = trace()
    item.durationS = stream.length
    item.distance = new Float64Array(stream.length).fill(1)
    item.paused = new Uint8Array(stream.length)
    item.unrecorded = new Uint8Array(stream.length)
    item.streams.speed = stream
    // The first ~118-sample bucket contains several short valid runs. It must
    // collapse to a gap, not connect the observations across missing spans.
    for (const index of [10, 12, 14, 16, 18, 20]) stream[index] = Number.NaN
    const points = downsampleActivityTrace(item, 'speed', 0, stream.length, 600)
    const firstBucket = points.filter((point) => point.timeS < 118)
    expect(firstBucket).toHaveLength(1)
    expect(Number.isNaN(firstBucket[0]?.value)).toBe(true)
    expect(points.length).toBeLessThanOrEqual(600)
    expect(points.some((point) => point.timeS > 118 && Number.isFinite(point.value))).toBe(true)
  })

  it('excludes implausible source outliers from plotted observations', () => {
    const item = trace()
    item.streams.heartRate = Float32Array.from([120, 121, 122, 123, 999, 125, 126, 127, 128, 129])
    const points = downsampleActivityTrace(item, 'heartRate', 0, item.durationS, 600)
    expect(points.some((point) => point.value === 999)).toBe(false)
    expect(points.some((point) => Number.isNaN(point.value))).toBe(true)
  })

  it('uses generic cadence units and explains when the source unit is unknown', async () => {
    const unknown = trace()
    unknown.cadenceUnit = 'unknown'
    render(
      <ActivityWorkbench
        activityId="run-1"
        units="metric"
        loadTrace={async () => ({ kind: 'trace', trace: unknown })}
      />,
    )
    expect(
      await screen.findByRole('checkbox', { name: /Cadence \(counts\/min\)/ }),
    ).toBeInTheDocument()
    expect(screen.getByText('The source did not identify cadence units.')).toBeInTheDocument()
    expect(
      await screen.findByRole('img', { name: 'Cadence during selected moving time' }),
    ).toBeInTheDocument()
  })

  it('offers an explicit original read only when the worker reports one is available', async () => {
    const user = userEvent.setup()
    const loadTrace = vi.fn(
      async (_id: string, fromOriginal?: boolean): Promise<ActivityTraceReply> =>
        fromOriginal ? { kind: 'trace', trace: trace() } : { kind: 'original' },
    )
    render(<ActivityWorkbench activityId="run-1" units="metric" loadTrace={loadTrace} />)

    const read = await screen.findByRole('button', { name: 'Read original file' })
    await user.click(read)
    await waitFor(() => expect(loadTrace).toHaveBeenLastCalledWith('run-1', true))
    expect(await screen.findByText('Read from the original file.')).toBeInTheDocument()
  })

  it('explains when details are unavailable and offers retry after a source failure', async () => {
    const loadTrace = vi.fn(async () => ({ kind: 'missing' }) satisfies ActivityTraceReply)
    render(<ActivityWorkbench activityId="run-1" units="metric" loadTrace={loadTrace} />)
    expect(await screen.findByText(/no original file is available/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Read original file' })).not.toBeInTheDocument()

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
