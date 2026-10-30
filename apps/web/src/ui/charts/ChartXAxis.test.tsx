// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../components/stylesheet'
import { ChartXAxis } from './ChartXAxis'
import { labelWidth } from './ticks'
import type { PlotBox } from './chartTypes'

const axisCss = await readStylesheet(import.meta.url, './ChartXAxis.css')

const PLOT: PlotBox = { left: 56, right: 304, top: 28, bottom: 268 }

afterEach(() => {
  cleanup()
})

/** The anchor of each tick label, in tick order. */
function anchors(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll('.chart-x-axis__tick')).map((tick) =>
    tick.getAttribute('text-anchor'),
  )
}

describe('ChartXAxis', () => {
  it('draws no axis title when none is given, since the dates on it say what they are', () => {
    const { container } = render(
      <svg>
        <ChartXAxis ticks={[{ position: 180, label: 'Sun 12 Jan' }]} plot={PLOT} />
      </svg>,
    )
    expect(container.querySelector('.chart-x-axis__title')).toBeNull()
    expect(container.querySelector('.chart-x-axis__tick')).toHaveTextContent('Sun 12 Jan')
  })

  it('takes its tick size from the chart width alone, so no stylesheet size competes with it', () => {
    expect(ruleBody(axisCss, '.chart-x-axis__tick')).not.toMatch(/font-size/)
  })

  it('sets its tick text in rem, so it grows with the reader’s text size', () => {
    const { container } = render(
      <svg>
        <ChartXAxis
          ticks={[{ position: 180, label: '20 min' }]}
          plot={PLOT}
          title="Duration"
          fontSize={13}
        />
      </svg>,
    )
    expect(container.querySelector('.chart-x-axis__tick')?.getAttribute('style')).toContain(
      'font-size: 0.8125rem',
    )
  })

  it('centres a label that has room on both sides of its tick', () => {
    const { container } = render(
      <svg>
        <ChartXAxis ticks={[{ position: 180, label: '20 min' }]} plot={PLOT} title="Duration" />
      </svg>,
    )
    expect(anchors(container)).toEqual(['middle'])
  })

  it('keeps the first and last labels inside the plot, anchored to the edge they would cross', () => {
    const { container } = render(
      <svg>
        <ChartXAxis
          ticks={[
            { position: PLOT.left + 4, label: 'Jan 2025' },
            { position: 180, label: '1 h' },
            { position: PLOT.right - 4, label: 'Jun 2025' },
          ]}
          plot={PLOT}
          title="Week ending"
        />
      </svg>,
    )
    const labels = Array.from(container.querySelectorAll('.chart-x-axis__tick'))
    const [first, , last] = labels
    if (first === undefined || last === undefined) throw new Error('expected three labels')
    expect(labels.map((label) => label.getAttribute('text-anchor'))).toEqual([
      'start',
      'middle',
      'end',
    ])
    // The estimated extent of each label, from its anchor: the first starts inside the plot's left
    // edge and the last ends inside its right edge.
    const extentOf = (label: Element) => {
      const x = Number(label.getAttribute('x'))
      const width = labelWidth(label.textContent ?? '', 12, 1)
      const anchor = label.getAttribute('text-anchor')
      const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2
      return { left, right: left + width }
    }
    expect(extentOf(first).left).toBeGreaterThanOrEqual(PLOT.left)
    expect(extentOf(last).right).toBeLessThanOrEqual(PLOT.right)
  })

  it('drops the middle label that meets the last one, keeping both ends and every grid line', () => {
    // The last label is anchored to the plot's right edge, so it sits nearer its neighbour than the thinning allowed for.
    const ticks = [
      { position: 56, label: '1' },
      { position: 278, label: '60' },
      { position: 296, label: '120' },
    ]
    const { container } = render(
      <svg>
        <ChartXAxis ticks={ticks} plot={PLOT} />
      </svg>,
    )
    const shown = Array.from(container.querySelectorAll('.chart-x-axis__tick')).map(
      (tick) => tick.textContent,
    )
    expect(shown).toEqual(['1', '120'])
    expect(container.querySelectorAll('.chart-x-axis__grid')).toHaveLength(3)
  })

  it('keeps every label when each has its room', () => {
    const ticks = [
      { position: 56, label: '1' },
      { position: 180, label: '20' },
      { position: 304, label: '120' },
    ]
    const { container } = render(
      <svg>
        <ChartXAxis ticks={ticks} plot={PLOT} />
      </svg>,
    )
    expect(container.querySelectorAll('.chart-x-axis__tick')).toHaveLength(3)
  })
})
