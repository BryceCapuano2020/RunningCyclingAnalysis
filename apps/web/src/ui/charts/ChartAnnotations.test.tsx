// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { readStylesheet } from '../components/stylesheet'
import { ChartAnnotations } from './ChartAnnotations'
import type { Annotation } from './annotations'
import type { ChartSize } from './chartTypes'

afterEach(cleanup)

const css = await readStylesheet(import.meta.url, './ChartAnnotations.css')

const SIZE: ChartSize = {
  width: 1048,
  height: 320,
  plot: { left: 56, right: 868, top: 28, bottom: 268 },
  tooltipId: 't',
  hintId: 'h',
  titleId: 'i',
}

const ALL: Annotation[] = [
  {
    kind: 'callout',
    id: 'best',
    tone: 'run',
    at: { x: 300, y: 200 },
    value: '6:37 /mi',
    label: '20 min',
    caption: '3.4 W/kg',
  },
  {
    kind: 'end',
    id: 'end',
    tone: 'run',
    at: { x: 868, y: 240 },
    text: '8:51 /mi',
    sub: 'at 90 min',
  },
  {
    kind: 'reference',
    id: 'threshold',
    y: 150,
    label: 'Threshold',
    value: '7:12 /mi',
    band: { top: 144, bottom: 156 },
  },
]

function draw(annotations: Annotation[] = ALL, size = SIZE) {
  return render(
    <svg>
      <ChartAnnotations annotations={annotations} size={size} />
    </svg>,
  )
}

describe('ChartAnnotations', () => {
  it('draws each kind of annotation, named by its id', () => {
    const { container } = draw()
    for (const [id, kind] of [
      ['best', 'callout'],
      ['end', 'end'],
      ['threshold', 'reference'],
    ]) {
      expect(container.querySelector(`[data-annotation="${id}"]`)).toHaveClass(`annot--${kind}`)
    }
  })

  it('writes a callout as its eyebrow, its value with the unit apart and its caption, with a leader line to the point', () => {
    const { container } = draw()
    const callout = container.querySelector('[data-annotation="best"]')
    expect([...(callout?.querySelectorAll('text') ?? [])].map((text) => text.textContent)).toEqual([
      '20 min',
      '6:37 /mi',
      '3.4 W/kg',
    ])
    expect(callout?.querySelector('.annot__unit')?.textContent).toBe(' /mi')
    expect(callout?.querySelector('.annot__leader')).not.toBeNull()
    // The value is set at display size, in rem so it follows the reader's text size.
    expect(callout?.querySelector<SVGTextElement>('.annot__text--value')?.style.fontSize).toBe(
      '1.875rem',
    )
  })

  it('draws a reference line as a rule across the plot with its range as a band', () => {
    const { container } = draw()
    const rule = container.querySelector('[data-annotation="threshold"] .annot__rule')
    expect(rule?.getAttribute('x1')).toBe('56')
    expect(rule?.getAttribute('x2')).toBe('868')
    expect(rule?.getAttribute('y1')).toBe('150')
    const band = container.querySelector('[data-annotation="threshold"] .annot__band')
    expect(band?.getAttribute('y')).toBe('144')
    expect(band?.getAttribute('height')).toBe('12')
  })

  it('sets a phone’s values a step smaller', () => {
    const { container } = draw(ALL, { ...SIZE, width: 358, plot: { ...SIZE.plot, right: 346 } })
    expect(
      container.querySelector<SVGTextElement>('[data-annotation="best"] .annot__text--value')?.style
        .fontSize,
    ).toBe('1.5rem')
  })

  it('draws nothing for no annotations', () => {
    const { container } = draw([])
    expect(container.querySelectorAll('[data-annotation]')).toHaveLength(0)
  })
})

describe('the annotation stylesheet', () => {
  it('sets every text over a halo in the card colour, painted under the fill', () => {
    expect(css).toMatch(/\.annot__text \{[^}]*paint-order: stroke/)
    expect(css).toMatch(/\.annot__text \{[^}]*stroke: var\(--surface-1\)/)
  })

  it('sets a value in the display face and never in a literal colour', () => {
    expect(css).toMatch(/\.annot__text--value \{[^}]*font-family: var\(--font-display\)/)
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })

  it('keeps its text and rules in system colours in forced colours', () => {
    const forced = css.slice(css.indexOf('@media (forced-colors: active)'))
    expect(forced).toContain('fill: CanvasText')
    expect(forced).toContain('stroke: Canvas')
    expect(forced).toContain('stroke: CanvasText')
  })
})
