// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ActivityTrace } from '@rca/core/workbench'
import { ActivityWorkbench } from './ActivityWorkbench'

/**
 * Seventy minutes at 3 m/s with a five-minute lap in the middle that climbs from 5.0 to 5.6 m/s: far faster than
 * the activity's average, so an axis read over the whole activity would leave it flat against the top edge.
 */
function runWithFastLap(): ActivityTrace {
  const seconds = 4200
  const speed = Float32Array.from({ length: seconds }, (_, i) =>
    i >= 3000 && i < 3300 ? 5 + (0.6 * (i - 3000)) / 300 : 3,
  )
  return {
    version: 1,
    activityId: 'run-fast-lap',
    sport: 'run',
    durationS: seconds,
    distance: Float64Array.from(speed, (_, i) => i * 3),
    paused: new Uint8Array(seconds),
    unrecorded: new Uint8Array(seconds),
    streams: { speed },
    laps: [
      { startS: 0, endS: 3000 },
      { startS: 3000, endS: 3300 },
      { startS: 3300, endS: seconds },
    ],
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

const yOf = (path: string | null | undefined) =>
  [...(path ?? '').matchAll(/[ML] [\d.-]+ ([\d.-]+)/g)].map((match) => Number(match[1]))

describe('the pace row after zooming to a lap', () => {
  it('is read on the lap, not the activity: the line clears both edges and nothing is marked past the axis', async () => {
    const user = userEvent.setup()
    show(runWithFastLap())
    const figure = await screen.findByRole('figure', { name: /^Pace over time/ })
    await user.click(screen.getByRole('button', { name: /^Lap 2 / }))
    const row = figure.querySelector('[data-channel="speed"]')!
    const ys = yOf(row.querySelector('.ts-stack__line')?.getAttribute('d'))
    // The row runs from 6 to 102 px; the line keeps its own headroom from both.
    expect(Math.min(...ys)).toBeGreaterThan(6 + 3)
    expect(Math.max(...ys)).toBeLessThan(102 - 3)
    expect(row.querySelector('.ts-stack__edge')?.getAttribute('d')).toBe('')
    expect(figure).not.toHaveTextContent('Reading beyond the chart edge')
    // The ticks are the lap's paces, 3:12 to 3:21 a kilometre, not the activity's 5:33.
    const labels = [...row.querySelectorAll('.ts-stack__tick')].map((tick) => tick.textContent)
    expect(labels.length).toBeGreaterThan(1)
    expect(labels.every((label) => /^3:[0-4]\d$/.test(label ?? ''))).toBe(true)
  })

  it('spaces its ticks evenly in pace, so a minute is as tall at either end', async () => {
    show(runWithFastLap())
    const figure = await screen.findByRole('figure', { name: /^Pace over time/ })
    const row = figure.querySelector('[data-channel="speed"]')!
    const ticks = [...row.querySelectorAll('text.ts-stack__tick')].map((tick) =>
      Number(tick.getAttribute('y')),
    )
    expect(ticks.length).toBeGreaterThan(2)
    const gaps = ticks.slice(1).map((y, i) => Math.abs(y - ticks[i]!))
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0]!, 0)
  })
})
