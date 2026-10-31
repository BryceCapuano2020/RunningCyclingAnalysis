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
function runWithArtifacts(seconds = 600, standing = 6, burst = 3): ActivityTrace {
  const speed = Float32Array.from({ length: seconds }, (_, i) => {
    if (i < standing) return 0.6
    if (i >= seconds - burst) return 8 + (i - (seconds - burst)) / 10
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
    durationS: seconds,
    distance,
    paused: new Uint8Array(seconds),
    unrecorded: new Uint8Array(seconds),
    streams: { speed },
    laps: [],
  }
}

/**
 * Twenty minutes with three seconds of standing start and three of a fast burst: each is a quarter of a
 * percent of the run, under the hundredth the axis leaves out of each end of the smoothed line.
 */
function runWithBriefArtifacts(): ActivityTrace {
  return runWithArtifacts(1200, 3, 3)
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
  it('reads the axis on the pace the run held, and says what lay past each end', async () => {
    show(runWithBriefArtifacts())
    const figure = await screen.findByRole('figure', { name: /^Pace over time/ })
    const drawing = within(figure).getByRole('img', {
      name: /^From 0:00 to 20:00: Pace mostly between/,
    })
    expect(drawing).toHaveAccessibleName(
      'From 0:00 to 20:00: Pace mostly between 4:10 /km and 5:33 /km',
    )
    // Neither artifact is on the axis: its ticks name the pace the run held, not 27:47 or 2:02.
    const ticks = [...row(figure, 'speed').querySelectorAll('.ts-stack__tick')].map(
      (tick) => tick.textContent,
    )
    // The run swung between 3 and 4 m/s a second; its trend sits near 3.5 m/s, 4:46 a kilometre, and the axis
    // is read there, on round paces, with neither the standing start (27:47) nor the burst (2:02) on it.
    expect(ticks).toEqual(['4:40', '4:50', '5:00'])
    // The clipped readings are bars on the row's top and bottom edges, keyed under the plot, and the line never leaves the row.
    // The key states the furthest raw readings past each edge, the burst and the standing start, as the pace is written.
    expect(figure).toHaveTextContent(
      'Reading beyond the chart edge: pace reached 2:02 /km and fell to 27:47 /km',
    )
    const edge = row(figure, 'speed').querySelector('.ts-stack__edge')?.getAttribute('d') ?? ''
    expect(edge).toMatch(/M [\d.-]+ 6 L/)
    expect(edge).toMatch(/M [\d.-]+ 102 L/)
    const ys = yOf(row(figure, 'speed').querySelector('.ts-stack__line')?.getAttribute('d'))
    expect(Math.min(...ys)).toBe(6)
    expect(Math.max(...ys)).toBe(102)
  })

  it('draws the raw spread as a band much rougher than the smoothed line it surrounds', async () => {
    const trace = runWithBriefArtifacts()
    // A slow swell with a second-by-second jitter on it, the way a watch's pace reads.
    trace.streams.speed = Float32Array.from(
      { length: 1200 },
      (_, i) => 3.5 + 0.6 * Math.sin(i / 120) + (i % 3 === 0 ? 0.35 : i % 3 === 1 ? -0.3 : 0),
    )
    show(trace)
    const figure = await screen.findByRole('figure', { name: /^Pace over time/ })
    const speed = row(figure, 'speed')
    const line = yOf(speed.querySelector('.ts-stack__line')?.getAttribute('d'))
    const band = yOf(speed.querySelector('.ts-stack__band')?.getAttribute('d')).slice(
      0,
      line.length,
    )
    const roughness = (values: number[]) =>
      values.slice(1).reduce((sum, value, i) => sum + Math.abs(value - values[i]!), 0) /
      values.length
    expect(roughness(line)).toBeLessThan(roughness(band) / 3)
  })

  it('does not let a spike set the axis: a rare spike is clipped at the edge and the trend keeps the row', async () => {
    const trace = runWithBriefArtifacts()
    trace.streams.speed = new Float32Array(1200).fill(3.5)
    trace.streams.speed[600] = 9
    show(trace)
    const figure = await screen.findByRole('figure', { name: /^Pace over time/ })
    const speed = row(figure, 'speed')
    expect(speed.querySelector('.ts-stack__edge')?.getAttribute('d')).toMatch(/M [\d.-]+ 6 L/)
    // The axis spans the steady 3.5 m/s with room, not the spike: the tick labels are paces near 4:46.
    const labels = [...speed.querySelectorAll('.ts-stack__tick')].map((tick) => tick.textContent)
    expect(labels.length).toBeGreaterThan(1)
    expect(labels.every((label) => /^[3-7]:\d\d$/.test(label ?? ''))).toBe(true)
  })

  it('leaves a row with no artifacts exactly as it was', async () => {
    const trace = runWithBriefArtifacts()
    trace.streams.speed = Float32Array.from({ length: 1200 }, (_, i) => 3.5 + (i % 2) * 0.05)
    show(trace)
    const figure = await screen.findByRole('figure', { name: /^Pace over time/ })
    expect(row(figure, 'speed').querySelector('.ts-stack__edge')?.getAttribute('d')).toBe('')
    expect(figure).not.toHaveTextContent('Reading beyond the chart edge')
  })
})

describe('ActivityWorkbench: the interval summary of a run', () => {
  it('gives a pace’s typical range, fastest first, and leaves the burst and the standing start out of it', async () => {
    show(runWithArtifacts())
    const table = await screen.findByRole('table', { name: /pace in the selected interval/i })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Measure', 'Average', 'Typical range', 'Time'])
    const pace = within(table).getByRole('row', { name: /^Pace/ })
    expect(pace).toHaveTextContent('4:10 to 5:33 /km')
    expect(pace).not.toHaveTextContent('2:02')
    expect(pace).not.toHaveTextContent('27:47')
  })

  it('gives the average pace the activity header gives: the distance over the moving time', async () => {
    show(runWithArtifacts())
    await screen.findByRole('figure', { name: /^Pace over time/ })
    // The distance up to the last sample, 2,087.7 m, over the 600 s: the activity header's own sum.
    expect(screen.getByText('Average pace').nextElementSibling).toHaveTextContent('4:47 /km')
  })

  it('gives heart rate its own typical range, in a table of its own beside the pace', async () => {
    const trace = runWithArtifacts()
    trace.streams.heartRate = Float32Array.from({ length: 600 }, (_, i) => 150 + (i % 2))
    show(trace)
    await screen.findByRole('figure', { name: /heart rate/ })
    const others = screen.getByRole('table', { name: /while moving in the selected interval/i })
    expect(
      within(others)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Measure', 'Average', 'Typical range', 'Time'])
    expect(within(others).queryByRole('row', { name: /^Pace/ })).not.toBeInTheDocument()
  })
})
