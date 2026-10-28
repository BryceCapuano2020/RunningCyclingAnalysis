// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ActivityTrace } from '@rca/core/workbench'
import { ActivityWorkbench } from './ActivityWorkbench'

/**
 * A ten-minute run that alternates between 3 and 4 m/s, with six seconds of a standing start at 0.6 m/s
 * and six seconds of a GPS spike at 8 m/s: the artifacts a plot's axis must not stretch over.
 */
function runWithArtifacts(): ActivityTrace {
  const speed = Float32Array.from({ length: 600 }, (_, i) => {
    if (i < 6) return 0.6
    if (i >= 594) return 8
    return i % 2 === 0 ? 3 : 4
  })
  let metres = 0
  const distance = Float64Array.from(speed, (value) => {
    const here = metres
    metres += value
    return here
  })
  return {
    version: 1,
    activityId: 'run-axis',
    sport: 'run',
    durationS: 600,
    distance,
    paused: new Uint8Array(600),
    unrecorded: new Uint8Array(600),
    streams: { speed },
    laps: [],
  }
}

function show(trace: ActivityTrace) {
  return render(
    <ActivityWorkbench
      activityId={trace.activityId}
      units="metric"
      loadTrace={async () => ({ kind: 'trace', trace })}
    />,
  )
}

describe('ActivityWorkbench: a pace plot and its artifacts', () => {
  it('spans the axis over the pace the run held, and says what lay past each end', async () => {
    show(runWithArtifacts())
    const figure = await screen.findByRole('figure', { name: /^Pace/ })
    const plot = within(figure).getByRole('img', { name: /^Pace from 0:00 to 10:00/ })
    expect(plot).toHaveAccessibleName('Pace from 0:00 to 10:00, between 4:10 /km and 5:33 /km')
    // The fastest pace tops the axis and the slowest ends it; neither artifact is on it.
    const axis = figure.querySelector('.activity-workbench__yaxis')
    expect(axis).toHaveTextContent('4:10 /km5:33 /km')
    expect(figure.querySelector('.activity-workbench__plot-body')).not.toHaveTextContent('27:47')
    expect(
      within(figure).getByText(
        'Past the axis, marked at its edge: 6 s slower than 5:33 /km, 6 s faster than 4:10 /km.',
      ),
    ).toBeInTheDocument()
    // The clipped readings are dots on the plot's edges, and the line never leaves the plot.
    const yOf = (path: string) =>
      [...path.matchAll(/[ML] [\d.]+ ([\d.]+)/g)].map((match) => Number(match[1]))
    const dots = yOf(figure.querySelector('.activity-workbench__clipped')?.getAttribute('d') ?? '')
    expect(dots).toContain(0)
    expect(dots).toContain(180)
    expect(dots.every((y) => y === 0 || y === 180)).toBe(true)
    const ys = yOf(figure.querySelector('.activity-workbench__line')?.getAttribute('d') ?? '')
    expect(Math.min(...ys)).toBe(0)
    expect(Math.max(...ys)).toBe(180)
  })

  it('draws the histogram over the same band, with every bar holding time', async () => {
    show(runWithArtifacts())
    const figure = await screen.findByRole('figure', { name: /^Pace/ })
    const histogram = within(figure).getByRole('img', { name: /^Time at each pace/ })
    expect(histogram).toHaveAccessibleName(
      'Time at each pace, from 4:10 /km to 5:33 /km. Most time at 4:10 /km–4:16 /km.',
    )
  })

  it('keeps the time past the axis in the table, so its rows add up to the moving time', async () => {
    show(runWithArtifacts())
    const figure = await screen.findByRole('figure', { name: /^Pace/ })
    const table = within(figure).getByRole('table', { name: /pace while moving/i })
    const rows = within(table).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Faster than 4:10 /km0:06')
    expect(rows.at(-1)).toHaveTextContent('Slower than 5:33 /km0:06')
  })

  it('leaves a plot with no artifacts exactly as it was', async () => {
    const trace = runWithArtifacts()
    trace.streams.speed = Float32Array.from({ length: 600 }, (_, i) => (i % 2 === 0 ? 3 : 4))
    show(trace)
    const figure = await screen.findByRole('figure', { name: /^Pace/ })
    expect(figure.querySelector('.activity-workbench__clipped')).toBeNull()
    expect(figure).not.toHaveTextContent('Past the axis')
  })
})

describe('ActivityWorkbench: the interval summary of a run', () => {
  it('names a pace’s extremes fastest and slowest, and keeps its true extremes', async () => {
    show(runWithArtifacts())
    const table = await screen.findByRole('table', { name: /pace in the selected interval/i })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Measure', 'Average', 'Fastest', 'Slowest', 'Time'])
    const pace = within(table).getByRole('row', { name: /^Pace/ })
    expect(pace).toHaveTextContent('2:05 /km')
    expect(pace).toHaveTextContent('27:47 /km')
  })

  it('gives the average pace the activity header gives: the distance over the moving time', async () => {
    show(runWithArtifacts())
    await screen.findByRole('figure', { name: /^Pace/ })
    // The distance up to the last sample, 2,101.6 m, over the 600 s: the activity header's own sum.
    expect(screen.getByText('Average pace').nextElementSibling).toHaveTextContent('4:45 /km')
  })

  it('gives heart rate its own lowest and highest, in a table of its own beside the pace', async () => {
    const trace = runWithArtifacts()
    trace.streams.heartRate = new Float32Array(600).fill(150)
    show(trace)
    await screen.findByRole('figure', { name: /^Heart rate/ })
    const others = screen.getByRole('table', { name: /while moving in the selected interval/i })
    expect(
      within(others)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Measure', 'Average', 'Lowest', 'Highest', 'Time'])
    expect(within(others).queryByRole('row', { name: /^Pace/ })).not.toBeInTheDocument()
  })
})
