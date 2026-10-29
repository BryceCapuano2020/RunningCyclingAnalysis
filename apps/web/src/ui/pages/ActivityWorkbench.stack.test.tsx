// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ActivityTrace } from '@rca/core/workbench'
import { layoutOf } from '../charts/timeSeriesLayout'
import { ActivityWorkbench } from './ActivityWorkbench'
import { runTrace, steadyTrace } from './workbenchFixtures'

function show(trace: ActivityTrace) {
  return render(
    <ActivityWorkbench
      activityId={trace.activityId}
      units="metric"
      loadTrace={async () => ({ kind: 'trace', trace })}
    />,
  )
}

const svgOf = (element: Element) => element.closest('svg')!

/** The plot surface, the one focusable layer over the stack. */
async function surface(): Promise<HTMLElement> {
  return screen.findByRole('group', { name: /over time$/ })
}

describe('the stack’s crosshair and readout', () => {
  it('reads the elapsed time, distance and each measure at the cursor, and moves with the arrow keys', async () => {
    const user = userEvent.setup()
    show(steadyTrace(600, 3))
    const plot = await surface()
    const status = within(screen.getByRole('figure')).getByRole('status')
    expect(status).toHaveTextContent('SelectionAverage')
    expect(svgOf(plot).querySelector('.ts-stack__crosshair')).toBeNull()

    plot.focus()
    await user.keyboard('{ArrowRight}')
    expect(status).toHaveTextContent('Elapsed0:000.0 km')
    expect(svgOf(plot).querySelector('.ts-stack__crosshair')).not.toBeNull()
    // A hundredth of ten minutes is six seconds.
    await user.keyboard('{ArrowRight}')
    expect(status).toHaveTextContent('Elapsed0:06')
    expect(status).toHaveTextContent('Pace5:33/km')
    expect(status).toHaveTextContent('Heart rate140bpm')
    await user.keyboard('{End}')
    expect(status).toHaveTextContent('Elapsed9:59')
    expect(status).toHaveTextContent('1.8 km')
    await user.keyboard('{Home}')
    expect(status).toHaveTextContent('Elapsed0:00')
    await user.keyboard('{Escape}')
    expect(status).toHaveTextContent('SelectionAverage')
    expect(svgOf(plot).querySelector('.ts-stack__crosshair')).toBeNull()
  })

  it('announces a key’s step to a screen reader, and keeps quiet for a pointer and for the idle averages', async () => {
    const user = userEvent.setup()
    show(steadyTrace(600, 3))
    const plot = await surface()
    const status = within(screen.getByRole('figure')).getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'off')
    fireEvent.pointerMove(plot, { clientX: 300, clientY: 40, pointerType: 'mouse' })
    expect(status).toHaveAttribute('aria-live', 'off')
    plot.focus()
    await user.keyboard('{ArrowRight}')
    expect(status).toHaveAttribute('aria-live', 'polite')
    await user.keyboard('{Escape}')
    expect(status).toHaveAttribute('aria-live', 'off')
  })

  it('draws the readout once, into the row the stack keeps, and not first inline', async () => {
    show(steadyTrace(600, 3))
    await surface()
    const rows = document.querySelectorAll('.chart-frame__readout')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.querySelectorAll('[role="status"]')).toHaveLength(1)
    expect(document.querySelectorAll('[role="status"].ts-readout')).toHaveLength(1)
  })

  it('puts a ringed dot on each measure’s line at the cursor, and none where it has no reading', async () => {
    const trace = steadyTrace(600, 3)
    trace.streams.heartRate!.fill(Number.NaN, 0, 100)
    const user = userEvent.setup()
    show(trace)
    const plot = await surface()
    plot.focus()
    await user.keyboard('{ArrowRight}')
    const svg = svgOf(plot)
    // Pace has a reading at the start; heart rate has none until the hundredth second.
    expect(svg.querySelectorAll('.ts-stack__dot')).toHaveLength(1)
    expect(within(screen.getByRole('figure')).getByRole('status')).toHaveTextContent('No reading')
    await user.keyboard('{End}')
    expect(svg.querySelectorAll('.ts-stack__dot')).toHaveLength(2)
  })

  it('follows a pointer over the plot and clears when it leaves', async () => {
    show(steadyTrace(600, 3))
    const plot = await surface()
    const status = within(screen.getByRole('figure')).getByRole('status')
    // The plot is 584 px wide from x = 44 at the default width, for 600 s: halfway is 5:00.
    fireEvent.pointerMove(plot, { clientX: 44 + 292, clientY: 40, pointerType: 'mouse' })
    expect(status).toHaveTextContent('Elapsed5:00')
    fireEvent.pointerLeave(plot, { pointerType: 'mouse' })
    expect(status).toHaveTextContent('SelectionAverage')
  })

  it('keeps a touch’s reading after the finger lifts, as the other charts do', async () => {
    show(steadyTrace(600, 3))
    const plot = await surface()
    fireEvent.pointerDown(plot, { clientX: 44 + 146, clientY: 40, pointerType: 'touch' })
    fireEvent.pointerLeave(plot, { pointerType: 'touch' })
    expect(within(screen.getByRole('figure')).getByRole('status')).toHaveTextContent('Elapsed2:30')
  })
})

describe('the readout and the interval summary', () => {
  it('give the same average for the same seconds, whole and for a lap', async () => {
    const user = userEvent.setup()
    show(runTrace())
    const status = within(await screen.findByRole('figure')).getByRole('status')
    const tableAverage = async (name: RegExp, row: RegExp) =>
      within(
        within(await screen.findByRole('table', { name })).getByRole('row', { name: row }),
      ).getAllByRole('cell')[0]!.textContent
    for (const lap of [null, /^Lap 1/, /^Lap 2/]) {
      if (lap !== null) await user.click(screen.getByRole('button', { name: lap }))
      const pace = await tableAverage(/pace in the selected interval/i, /^Pace/)
      const heart = await tableAverage(/while moving in the selected interval/i, /^Heart rate/)
      expect(status).toHaveTextContent(`Pace${pace!.replace(' ', '')}`)
      expect(status).toHaveTextContent(`Heart rate${heart!.replace(' ', '')}`)
    }
  })
})

describe('the stack’s laps and notes on the timeline', () => {
  it('shades every second lap behind the rows', async () => {
    const trace = steadyTrace(600, 3)
    trace.laps = [
      { startS: 0, endS: 200 },
      { startS: 200, endS: 400 },
      { startS: 400, endS: 600 },
    ]
    show(trace)
    const plot = await surface()
    expect(svgOf(plot).querySelectorAll('.ts-stack__lap')).toHaveLength(1)
  })

  it('zooms the stack to a chosen lap and reads the lap in its own window', async () => {
    const user = userEvent.setup()
    show(runTrace())
    await user.click(await screen.findByRole('button', { name: /^Lap 1/ }))
    expect(screen.getByRole('img', { name: /^From 0:02 to 0:06:/ })).toBeInTheDocument()
  })

  it('draws a pause and a gap as marks on the lane under the rows, and keys only those that are there', async () => {
    show(runTrace())
    const plot = await surface()
    const svg = svgOf(plot)
    expect(svg.querySelectorAll('.ts-stack__mark--paused')).toHaveLength(1)
    expect(svg.querySelectorAll('.ts-stack__mark--unrecorded')).toHaveLength(1)
    const figure = screen.getByRole('figure')
    expect(figure).toHaveTextContent('Paused')
    expect(figure).toHaveTextContent('Not recorded')
  })

  it('draws no marks, and no key for them, on an activity with none', async () => {
    show(steadyTrace(120))
    const plot = await surface()
    expect(svgOf(plot).querySelectorAll('.ts-stack__mark')).toHaveLength(0)
    const figure = screen.getByRole('figure')
    expect(figure).not.toHaveTextContent('Paused')
    expect(figure).not.toHaveTextContent('Reading left out')
  })

  it('marks the readings the analysis left out as ticks on their own row', async () => {
    const trace = steadyTrace(300)
    const mask = new Uint8Array(300)
    mask.fill(1, 100, 104)
    trace.unusable = { heartRate: mask }
    show(trace)
    const plot = await surface()
    const svg = svgOf(plot)
    expect(svg.querySelectorAll('[data-channel="heartRate"] .ts-stack__skipped')).toHaveLength(1)
    expect(svg.querySelectorAll('[data-channel="speed"] .ts-stack__skipped')).toHaveLength(0)
    expect(screen.getByRole('figure')).toHaveTextContent('Reading left out')
  })

  it('says what the line and the band are, with the average’s length for the window', async () => {
    show(steadyTrace(3600))
    await surface()
    expect(screen.getByRole('figure')).toHaveTextContent(
      'Lines show 21 s averages; bands show the full range.',
    )
  })

  it('keeps the table twin for every measure shown', async () => {
    show(steadyTrace(120))
    await surface()
    const figure = screen.getByRole('figure')
    expect(
      within(figure).getByRole('table', { name: 'Pace by section of the interval' }),
    ).toBeInTheDocument()
    expect(
      within(figure).getByRole('table', { name: 'Heart rate by section of the interval' }),
    ).toBeInTheDocument()
  })
})

describe('the stack’s layout', () => {
  const channel = (weight: number) => ({ weight }) as Parameters<typeof layoutOf>[1][number]

  it('keeps four measures of a phone under half a screen, so the whole timeline fits 700 px', () => {
    const layout = layoutOf(390, [1, 1, 1, 0.6].map(channel))
    expect(layout.height).toBeLessThan(340)
    // Every row is real pixels, tall enough to read: no row is squeezed below 32 px.
    for (const row of layout.rows) expect(row.bottom - row.top).toBeGreaterThanOrEqual(32)
  })

  it('gives each row its weight of the base height, and a gap between rows', () => {
    const { rows } = layoutOf(1200, [1, 0.6].map(channel))
    expect(rows[0]!.bottom - rows[0]!.top).toBe(96)
    expect(rows[1]!.bottom - rows[1]!.top).toBe(58)
    expect(rows[1]!.top - rows[0]!.bottom).toBe(10)
  })
})
