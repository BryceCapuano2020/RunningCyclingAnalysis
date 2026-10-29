// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { readStylesheet } from '../components/stylesheet'
import { ZoneTimeChart } from './ZoneTimeChart'
import type { ZoneChartRow } from './ZoneTimeChart'
import { FALLBACK_WIDTH } from './useSize'
import { percentFits, segmentsOf, takeawayText, underLabels } from './zoneBars'

afterEach(cleanup)

const css = await readStylesheet(import.meta.url, './ZoneTimeChart.css')

const table = { columns: ['Zone', 'Time'], rows: [['1', '10 s']] }
const NAMES = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'Maximum']

function chart(seconds: number[], extra: Partial<ZoneChartRow> = {}, label = 'Heart rate') {
  return render(
    <ZoneTimeChart
      title="Share of time in each zone"
      lede="Most of the time was easy."
      rows={[{ label, seconds, summary: 'zone 1 50%, zone 2 50%', ...extra }]}
      table={table}
    />,
  )
}

const segments = (container: HTMLElement) => [
  ...container.querySelectorAll<SVGRectElement>('rect.zone-time__segment'),
]

describe('segmentsOf', () => {
  it('lays the zones across the width in proportion, in order, and leaves out an empty zone', () => {
    const found = segmentsOf([25, 50, 0, 25, 0], 400)
    expect(found.map((s) => s.level)).toEqual([1, 2, 4])
    expect(found.map((s) => s.left)).toEqual([0, 100, 300])
    expect(found.map((s) => s.width)).toEqual([100, 200, 100])
    expect(found.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1, 9)
  })

  it('gives nothing for a bar with no time, not a divide by zero', () => {
    expect(segmentsOf([0, 0, 0, 0, 0], 400)).toEqual([])
  })
})

describe('ZoneTimeChart', () => {
  it('draws a segment for each zone that held time, across the whole width, with a 2 px gap between them', () => {
    const { container } = chart([25, 50, 0, 25, 0])
    const rects = segments(container)
    expect(rects).toHaveLength(3)
    const edges = rects.map((rect) => [
      Number(rect.getAttribute('x')),
      Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')),
    ])
    const edge = (segment: number, side: 0 | 1) => edges[segment]?.[side] ?? Number.NaN
    expect(edge(0, 0)).toBe(0)
    expect(edge(2, 1)).toBeCloseTo(FALLBACK_WIDTH, 6)
    // Each neighbouring pair is 2 px apart, so the gap is the same wherever the zones meet.
    expect(edge(1, 0) - edge(0, 1)).toBeCloseTo(2, 6)
    expect(edge(2, 0) - edge(1, 1)).toBeCloseTo(2, 6)
  })

  it('marks each segment with its zone, which the stylesheet colours from the ramp', () => {
    const { container } = chart([1, 1, 1, 1, 1])
    expect(segments(container).map((rect) => rect.getAttribute('data-zone'))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ])
  })

  it('writes the percent inside a segment that is wide enough, and leaves a sliver bare', () => {
    const { container } = chart([1, 98, 1, 0, 0])
    const percents = [...container.querySelectorAll('.zone-time__percent[data-zone]')]
      .filter((text) => !text.classList.contains('zone-time__percent--key'))
      .map((text) => text.textContent)
    expect(percents).toEqual(['98%'])
  })

  it('names every zone under its segment where the segment can hold the name', () => {
    const { container } = chart([1, 60, 24, 14, 1], { names: NAMES })
    const under = [...container.querySelectorAll('.zone-time__number')]
      .map((text) => text.textContent)
      .filter((text) => text !== 'Easy' && text !== 'Hard')
    // Every segment wide enough holds its number and name; the 1% slivers are too narrow for either.
    expect(under).toEqual(['2 Endurance', '3 Tempo', '4 Threshold'])
  })

  it('numbers every zone that is wide enough when the row has no names', () => {
    const { container } = chart([40, 40, 20, 0, 0])
    const under = [...container.querySelectorAll('.zone-time__number')]
      .map((text) => text.textContent)
      .filter((text) => text !== 'Easy' && text !== 'Hard')
    expect(under).toEqual(['1', '2', '3'])
  })

  it('writes the easy and hard shares above the bar as its takeaway', () => {
    const { container } = chart([31, 0, 41, 11, 17], { easyHard: { easy: 0.31, hard: 0.28 } })
    expect(container.querySelector('.zone-time__takeaway')?.textContent).toBe('31% easy · 28% hard')
  })

  it('has no takeaway line for a row that gives no split', () => {
    const { container } = chart([1, 1, 0, 0, 0])
    expect(container.querySelector('.zone-time__takeaway')).toBeNull()
  })

  it('ends with a key from easy to hard, each step in its own ramp colour', () => {
    const { container } = chart([1, 1, 1, 1, 1])
    const chips = [...container.querySelectorAll('.zone-time__chip')]
    expect(chips.map((chip) => chip.getAttribute('data-zone'))).toEqual(['1', '2', '3', '4', '5'])
    const words = [...container.querySelectorAll('.zone-time__key .zone-time__number')].map(
      (text) => text.textContent,
    )
    expect(words).toEqual(['Easy', 'Hard'])
  })

  it('stacks one band for each measure above the key', () => {
    const { container } = render(
      <ZoneTimeChart
        title="Share of time in each zone"
        lede=""
        rows={[
          { label: 'Heart rate', seconds: [1, 1, 1, 1, 1], summary: 'x' },
          { label: 'Pace', seconds: [1, 1, 1, 1, 1], summary: 'y' },
        ]}
        table={table}
      />,
    )
    const labels = [...container.querySelectorAll('.zone-time__label')].map(
      (text) => text.textContent,
    )
    expect(labels).toEqual(['Heart rate', 'Pace'])
    const [first, second] = [...container.querySelectorAll('.zone-time__label')]
    expect(Number(second!.getAttribute('y'))).toBeGreaterThan(Number(first!.getAttribute('y')) + 60)
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

  it('draws a bar with no time as nothing', () => {
    const { container } = chart([0, 0, 0, 0, 0])
    expect(segments(container)).toHaveLength(0)
  })
})

describe('percentFits', () => {
  it('needs room for the text at display size and a little over, and more at a larger root font', () => {
    expect(percentFits('41%', 60, 16)).toBe(true)
    expect(percentFits('41%', 40, 16)).toBe(false)
    expect(percentFits('41%', 60, 32)).toBe(false)
    expect(percentFits('<1%', 20, 16)).toBe(false)
  })
})

describe('underLabels', () => {
  const NAMES = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'Maximum']
  const plan = (seconds: number[], width = 640, names: readonly string[] | null = NAMES) =>
    underLabels(segmentsOf(seconds, width), names ?? undefined, width, 16)

  it('names every segment that can hold its number and name, and numbers the rest where a number fits', () => {
    const labels = plan([30, 30, 30, 5, 5], 900)
    expect(labels.map((label) => label.text).slice(0, 3)).toEqual([
      '1 Recovery',
      '2 Endurance',
      '3 Tempo',
    ])
    // Two 5% segments are 45 px each: "Maximum" fits its room, "Threshold" is longer than the room, so it shows its number.
    expect(labels.map((label) => label.text).slice(3)).toEqual(['4', '5 Maximum'])
  })

  it('shows a number alone where the name does not fit, and the same rule for every segment', () => {
    // 320 px: 2 of 10 percent is 32 px, too narrow for "4 Threshold" but wide enough for "4".
    const labels = plan([40, 30, 20, 8, 2], 320)
    const byLevel = Object.fromEntries(labels.map((label) => [label.level, label.text]))
    expect(byLevel[1]).toBe('1 Recovery')
    expect(byLevel[2]).toBe('2 Endurance')
    expect(byLevel[3]).toBe('3 Tempo')
    expect(byLevel[4]).toBe('4')
    expect(byLevel[5]).toBeUndefined()
  })

  it('lets a name reach into the room a narrow neighbour leaves empty, and no further', () => {
    // Zone 2 is 6 px wide, too narrow to label, so zone 3's name may overhang it by a little.
    const labels = plan([40, 1, 18, 40, 1], 300)
    expect(labels.map((label) => label.level)).toEqual([1, 3, 4])
  })

  it('never lets two labels touch, or one leave the bar', () => {
    for (const seconds of [
      [20, 20, 20, 20, 20],
      [5, 45, 5, 40, 5],
      [1, 1, 96, 1, 1],
      [33, 2, 30, 3, 32],
    ]) {
      const labels = plan(seconds, 360)
      const half = (text: string) => (text.length * 12 * 0.52) / 2
      for (const [i, label] of labels.entries()) {
        expect(label.x - half(label.text)).toBeGreaterThanOrEqual(-0.001)
        expect(label.x + half(label.text)).toBeLessThanOrEqual(360.001)
        const next = labels[i + 1]
        if (next) expect(next.x - half(next.text)).toBeGreaterThan(label.x + half(label.text))
      }
    }
  })

  it('numbers every zone, with no names, where the row gives none', () => {
    expect(plan([40, 40, 20, 0, 0], 640, null).map((label) => label.text)).toEqual(['1', '2', '3'])
  })

  it('needs more room at a larger root font, which sets the text larger', () => {
    const wide = underLabels(segmentsOf([10, 10, 10, 10, 10], 400), NAMES, 400, 16)
    const large = underLabels(segmentsOf([10, 10, 10, 10, 10], 400), NAMES, 400, 32)
    const named = (labels: typeof wide) => labels.filter((label) => label.text.length > 1).length
    expect(named(large)).toBeLessThan(named(wide))
  })
})

describe('takeawayText', () => {
  it('reads the easy and hard shares as whole percents', () => {
    expect(takeawayText({ easy: 0.314, hard: 0.2791 })).toBe('31% easy · 28% hard')
    expect(takeawayText({ easy: 0, hard: 0.001 })).toBe('0% easy · <1% hard')
  })
})

describe('ZoneTimeChart styles', () => {
  it.each([1, 2, 3, 4, 5])(
    'colours zone %i from the sport ramp, and its percent from that step’s ink',
    (zone) => {
      // A chart outside a sport's surface falls back to the running ramp, so no segment is left unpainted.
      expect(css).toMatch(
        new RegExp(
          `\\.zone-time__segment\\[data-zone='${zone}'\\][^{]*\\{[^}]*fill: var\\(--zone-${zone}, var\\(--zone-run-${zone}\\)\\)`,
        ),
      )
      expect(css).toMatch(
        new RegExp(
          `\\.zone-time__percent\\[data-zone='${zone}'\\] \\{[^}]*fill: var\\(--zone-ink-${zone}\\)`,
        ),
      )
    },
  )

  it('never uses a literal colour, a tint of the sport colour or the old tint variable', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(css).not.toContain('--zone-tint')
    expect(css).not.toContain('--sport-colour')
  })

  it('falls back in forced colours to the highlight with its own text colour, and system text elsewhere', () => {
    const forced = css.slice(css.indexOf('@media (forced-colors: active)'))
    expect(forced).toMatch(/\.zone-time__segment\[data-zone\],[^{]*\{[^}]*fill: Highlight/)
    expect(forced).toMatch(/\.zone-time__percent\[data-zone\] \{[^}]*fill: HighlightText/)
    expect(forced).toContain('CanvasText')
  })
})
