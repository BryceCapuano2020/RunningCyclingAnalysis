// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChartYAxis } from './ChartYAxis'
import { PHONE_CHART_HEIGHT, plotBoxOf } from './plotBox'
import { axisFontSize } from './ticks'
import { insideLabelBoxes } from './yAxisLabels'

afterEach(cleanup)

const TICKS = [
  { position: 40, label: '1,000' },
  { position: 120, label: '500' },
]

function draw(left: number) {
  return render(
    <svg>
      <ChartYAxis ticks={TICKS} plot={{ left, right: 300, top: 28, bottom: 200 }} />
    </svg>,
  )
}

describe('ChartYAxis', () => {
  it('sets labels in the gutter, right-aligned, where the widest fits it', () => {
    const { container } = draw(56)
    const tick = container.querySelector('.chart-y-axis__tick')
    expect(tick).not.toHaveClass('chart-y-axis__tick--inside')
    expect(tick?.getAttribute('text-anchor')).toBe('end')
    expect(tick?.getAttribute('x')).toBe('48')
  })

  it('keeps a pace of 10:00 in a phone’s gutter, 4 px from the plot, so no series crosses its label', () => {
    const plot = plotBoxOf(358, PHONE_CHART_HEIGHT, undefined, undefined, true)
    expect(plot.left).toBe(40)
    const ticks = ['4:00', '6:00', '10:00', '12:30'].map((label, i) => ({
      position: 60 + i * 40,
      label,
    }))
    const { container } = render(
      <svg>
        <ChartYAxis ticks={ticks} plot={plot} fontSize={axisFontSize(358)} />
      </svg>,
    )
    const drawn = [...container.querySelectorAll('.chart-y-axis__tick')]
    expect(drawn.map((tick) => tick.textContent)).toEqual(['4:00', '6:00', '10:00', '12:30'])
    for (const tick of drawn) {
      expect(tick).not.toHaveClass('chart-y-axis__tick--inside')
      expect(tick.getAttribute('text-anchor')).toBe('end')
      expect(tick.getAttribute('x')).toBe('36')
    }
  })

  it('sets a label wider than the phone’s gutter inside the plot, as before', () => {
    const plot = plotBoxOf(358, PHONE_CHART_HEIGHT, undefined, undefined, true)
    const { container } = render(
      <svg>
        <ChartYAxis
          ticks={[{ position: 100, label: '1:05:00' }]}
          plot={plot}
          fontSize={axisFontSize(358)}
        />
      </svg>,
    )
    expect(container.querySelector('.chart-y-axis__tick')).toHaveClass('chart-y-axis__tick--inside')
  })

  it('sets every label inside the plot, above its gridline, where the widest would be cut off by a narrow gutter', () => {
    const { container } = draw(30)
    const ticks = [...container.querySelectorAll('.chart-y-axis__tick')]
    for (const [i, tick] of ticks.entries()) {
      expect(tick).toHaveClass('chart-y-axis__tick--inside')
      expect(tick.getAttribute('text-anchor')).toBe('start')
      expect(Number(tick.getAttribute('x'))).toBeGreaterThan(30)
      expect(Number(tick.getAttribute('y'))).toBeLessThan(TICKS[i]!.position)
    }
  })

  it('draws a gridline at each tick across the plot', () => {
    const { container } = draw(56)
    const lines = [...container.querySelectorAll('.chart-y-axis__grid')]
    expect(lines.map((line) => line.getAttribute('y1'))).toEqual(['40', '120'])
    expect(lines[0]?.getAttribute('x1')).toBe('56')
    expect(lines[0]?.getAttribute('x2')).toBe('300')
  })

  it('draws the labels alone on a second pass: no gridlines or title, and still none that would run into the title', () => {
    const { container } = render(
      <svg>
        <ChartYAxis
          ticks={[{ position: 30, label: '11:00' }, ...TICKS]}
          plot={{ left: 30, right: 300, top: 28, bottom: 200 }}
          title="Flat pace"
          labelsOnly
        />
      </svg>,
    )
    expect(container.querySelectorAll('.chart-y-axis__grid')).toHaveLength(0)
    expect(container.querySelector('.chart-y-axis__title')).toBeNull()
    // The label near the top would run up into the title, so it is left off as in the full axis.
    expect(
      [...container.querySelectorAll('.chart-y-axis__tick')].map((t) => t.textContent),
    ).toEqual(['1,000', '500'])
  })

  it('reports the boxes of the labels it sets inside the plot, so a chart keeps its own labels off them', () => {
    const plot = { left: 20, right: 300, top: 28, bottom: 200 }
    const boxes = insideLabelBoxes(TICKS, plot, undefined)
    expect(boxes).toHaveLength(2)
    // Each starts 4 px inside the plot and reaches up from just above its gridline.
    expect(boxes.every((box) => box.left === 24 && box.right > box.left)).toBe(true)
    expect(boxes[1]!.bottom).toBeLessThan(120)
    expect(boxes[1]!.top).toBeLessThan(boxes[1]!.bottom - 10)
    // In a gutter wide enough for them there is nothing inside the plot to keep clear of.
    expect(insideLabelBoxes(TICKS, { ...plot, left: 80 }, undefined)).toEqual([])
    // A label that would run into the title is not drawn, so it takes no room.
    expect(
      insideLabelBoxes([{ position: 30, label: '11:00' }, ...TICKS], plot, 'Flat pace'),
    ).toHaveLength(2)
  })
})
