// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { readStylesheet } from '../components/stylesheet'
import { ZoneTimeChart } from './ZoneTimeChart'
import { FALLBACK_WIDTH } from './useSize'

afterEach(cleanup)

const css = await readStylesheet(import.meta.url, './ZoneTimeChart.css')

const table = { columns: ['Zone', 'Time'], rows: [['1', '10 s']] }

function chart(seconds: number[], label = 'Heart rate') {
  return render(
    <ZoneTimeChart
      title="Share of time in each zone"
      lede="Most of the time was easy."
      rows={[{ label, seconds, summary: 'zone 1 50%, zone 2 50%' }]}
      table={table}
    />,
  )
}

describe('ZoneTimeChart', () => {
  it('draws a segment for each zone that held time, across the whole width in proportion', () => {
    const { container } = chart([25, 50, 0, 25, 0])
    const rects = [...container.querySelectorAll('rect')]
    expect(rects).toHaveLength(3)
    const widths = rects.map((rect) => Number(rect.getAttribute('width')))
    expect(widths[0]).toBeCloseTo(FALLBACK_WIDTH * 0.25, 6)
    expect(widths[1]).toBeCloseTo(FALLBACK_WIDTH * 0.5, 6)
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(FALLBACK_WIDTH, 6)
    expect(Number(rects[1]!.getAttribute('x'))).toBeCloseTo(FALLBACK_WIDTH * 0.25, 6)
  })

  it('numbers a zone under its segment only where the segment is wide enough', () => {
    const { container } = chart([1, 98, 1, 0, 0])
    const numbers = [...container.querySelectorAll('.zone-time__number')].map((n) => n.textContent)
    expect(numbers).toEqual(['2'])
  })

  it('strengthens the tint with the zone, from the least that keeps contrast to 100 percent of the sport colour', () => {
    const { container } = chart([1, 1, 1, 1, 1])
    const tints = [...container.querySelectorAll<SVGRectElement>('rect')].map((rect) =>
      rect.style.getPropertyValue('--zone-tint'),
    )
    expect(tints).toEqual(['84%', '88%', '92%', '96%', '100%'])
  })

  it('names the drawing by every bar read as text, and keeps the table behind a disclosure', () => {
    chart([1, 1, 0, 0, 0])
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Stacked bars of the share of time in each zone. Heart rate: zone 1 50%, zone 2 50%.',
    )
    expect(screen.getByRole('figure', { name: 'Share of time in each zone' })).toBeInTheDocument()
    expect(screen.getByText('Most of the time was easy.')).toBeInTheDocument()
    expect(screen.getByText('View as table')).toBeInTheDocument()
  })

  it('draws a bar with no time as nothing, not as a divide by zero', () => {
    const { container } = chart([0, 0, 0, 0, 0])
    expect(container.querySelectorAll('rect')).toHaveLength(0)
  })
})

describe('ZoneTimeChart styles', () => {
  it('tints a segment from the sport colour and the page colour, never a literal colour', () => {
    expect(css).toContain('var(--sport-colour) var(--zone-tint)')
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })

  it('keeps the segments apart in forced colours, with system colours', () => {
    const forced = css.slice(css.indexOf('@media (forced-colors: active)'))
    expect(forced).toContain('fill: Highlight')
    expect(forced).toContain('stroke: Canvas')
    expect(forced).toContain('CanvasText')
  })
})
