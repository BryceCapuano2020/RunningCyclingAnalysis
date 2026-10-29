// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ActivityTrace } from '@rca/core/workbench'
import { ActivityWorkbench } from './ActivityWorkbench'

/**
 * A ten-minute run that alternates between 3 and 4 m/s, with six seconds of a standing start at 0.6 m/s
 * and three seconds of a fast burst from 8 m/s up: the standing start is an artifact the axis must not stretch
 * over; the fast end is cut only by half a percent, so just the three fastest seconds of the burst are.
 */
function runWithArtifacts(): ActivityTrace {
  const speed = Float32Array.from({ length: 600 }, (_, i) => {
    if (i < 6) return 0.6
    if (i >= 597) return 8 + (i - 597) / 10
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

/** The y of each point of a path drawn as "M x y L x y …". */
function yOf(path: string | null | undefined): number[] {
  return [...(path ?? '').matchAll(/[ML] [\d.-]+ ([\d.-]+)/g)].map((match) => Number(match[1]))
}

/** The stack's row for a measure, which holds its axis, its band and its line. */
function row(figure: HTMLElement, metric: string): Element {
  const found = figure.querySelector(`[data-channel="${metric}"]`)
  if (found === null) throw new Error(`no row for ${metric}`)
  return found
}

describe('ActivityWorkbench: a pace row and its artifacts', () => {
  it('spans the axis over the pace the run held, and says what lay past each end', async () => {
    show(runWithArtifacts())
    const figure = await screen.findByRole('figure', { name: /^Pace over time/ })
    const drawing = within(figure).getByRole('img', { name: /^From 0:00 to 10:00: Pace between/ })
    expect(drawing).toHaveAccessibleName('From 0:00 to 10:00: Pace between 4:10 /km and 5:33 /km')
    // Neither artifact is on the axis: its ticks name the pace the run held, not 27:47 or 2:02.
    const ticks = [...row(figure, 'speed').querySelectorAll('.ts-stack__tick')].map(
      (tick) => tick.textContent,
    )
    expect(ticks.length).toBeGreaterThan(1)
    expect(ticks).not.toContain('27:47')
    expect(
      within(figure).getByText(
        'Past the axis, marked at its edge: 6 s slower than 5:33 /km, 3 s faster than 4:10 /km.',
      ),
    ).toBeInTheDocument()
    // The clipped readings are arrowheads on the row's top and bottom edges, and the line never leaves the row.
    const edge = row(figure, 'speed').querySelector('.ts-stack__edge')?.getAttribute('d') ?? ''
    expect(edge).toMatch(/M [\d.-]+ 6 L/)
    expect(edge).toMatch(/M [\d.-]+ 102 L/)
    const ys = yOf(row(figure, 'speed').querySelector('.ts-stack__line')?.getAttribute('d'))
    expect(Math.min(...ys)).toBe(6)
    expect(Math.max(...ys)).toBe(102)
  })

  it('draws the raw spread as a band wider than the smoothed line it surrounds', async () => {
    show(runWithArtifacts())
    const figure = await screen.findByRole('figure', { name: /^Pace over time/ })
    const speed = row(figure, 'speed')
    const line = yOf(speed.querySelector('.ts-stack__line')?.getAttribute('d'))
    const band = yOf(speed.querySelector('.ts-stack__band')?.getAttribute('d'))
    // The readings alternate between two paces each second; the line is their average, so it moves less.
    const middle = (values: number[]) => values.slice(40, 560)
    const spread = (values: number[]) => Math.max(...values) - Math.min(...values)
    expect(spread(middle(line))).toBeLessThan(spread(middle(band)) / 2)
  })

  it('leaves a row with no artifacts exactly as it was', async () => {
    const trace = runWithArtifacts()
    trace.streams.speed = Float32Array.from({ length: 600 }, (_, i) => (i % 2 === 0 ? 3 : 4))
    show(trace)
    const figure = await screen.findByRole('figure', { name: /^Pace over time/ })
    expect(row(figure, 'speed').querySelector('.ts-stack__edge')?.getAttribute('d')).toBe('')
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
    expect(pace).toHaveTextContent('2:02 /km')
    expect(pace).toHaveTextContent('27:47 /km')
  })

  it('gives the average pace the activity header gives: the distance over the moving time', async () => {
    show(runWithArtifacts())
    await screen.findByRole('figure', { name: /^Pace over time/ })
    // The distance up to the last sample, 2,087.7 m, over the 600 s: the activity header's own sum.
    expect(screen.getByText('Average pace').nextElementSibling).toHaveTextContent('4:47 /km')
  })

  it('gives heart rate its own lowest and highest, in a table of its own beside the pace', async () => {
    const trace = runWithArtifacts()
    trace.streams.heartRate = new Float32Array(600).fill(150)
    show(trace)
    await screen.findByRole('figure', { name: /heart rate/ })
    const others = screen.getByRole('table', { name: /while moving in the selected interval/i })
    expect(
      within(others)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Measure', 'Average', 'Lowest', 'Highest', 'Time'])
    expect(within(others).queryByRole('row', { name: /^Pace/ })).not.toBeInTheDocument()
  })
})
