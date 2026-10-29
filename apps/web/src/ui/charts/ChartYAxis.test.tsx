// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChartYAxis } from './ChartYAxis'

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
})
