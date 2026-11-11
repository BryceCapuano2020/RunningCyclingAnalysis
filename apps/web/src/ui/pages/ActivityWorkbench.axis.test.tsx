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

// The first row runs from the room above it to its weight of the wide row height.
const ROW_TOP = 20
const ROW_BOTTOM = 108

describe('ActivityWorkbench: a pace row and its artifacts', () => {
  it('reads the axis on the pace the run held, with nothing keyed past each end', async () => {
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
    // The line never leaves the row, and nothing is drawn or keyed past its edges.
    expect(row(figure, 'speed').querySelector('.ts-stack__edge')).toBeNull()
    expect(figure).not.toHaveTextContent('Beyond the edge')
    const ys = yOf(row(figure, 'speed').querySelector('.ts-stack__line')?.getAttribute('d'))
    expect(Math.min(...ys)).toBe(ROW_TOP)
    expect(Math.max(...ys)).toBe(ROW_BOTTOM)
  })

  it('draws no spread band around the line', async () => {
    show(runWithBriefArtifacts())
    const figure = await screen.findByRole('figure', { name: /^Pace over time/ })
    expect(row(figure, 'speed').querySelector('.ts-stack__band')).toBeNull()
  })

  it('does not let a spike set the axis: a rare spike is clipped at the edge and the trend keeps the row', async () => {
    const trace = runWithBriefArtifacts()
    trace.streams.speed = new Float32Array(1200).fill(3.5)
    trace.streams.speed[600] = 9
    show(trace)
    const figure = await screen.findByRole('figure', { name: /^Pace over time/ })
    const speed = row(figure, 'speed')
    expect(speed.querySelector('.ts-stack__edge')).toBeNull()
    // The axis spans the steady 3.5 m/s with room, not the spike: the tick labels are paces near 4:46.
    const labels = [...speed.querySelectorAll('.ts-stack__tick')].map((tick) => tick.textContent)
    expect(labels.length).toBeGreaterThan(1)
    expect(labels.every((label) => /^[3-7]:\d\d$/.test(label ?? ''))).toBe(true)
  })
})
