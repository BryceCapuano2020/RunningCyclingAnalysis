// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChartAnnotations } from './ChartAnnotations'
import * as layout from './annotations'
import type { Annotation } from './annotations'
import type { ChartSize } from './chartTypes'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const SIZE: ChartSize = {
  width: 900,
  height: 320,
  plot: { left: 56, right: 884, top: 28, bottom: 268 },
  tooltipId: 't',
  hintId: 'h',
  titleId: 'i',
}
const ANNOTATIONS: Annotation[] = [
  { kind: 'callout', id: 'best', at: { x: 300, y: 200 }, value: '250 W', label: '20 min' },
]

describe('ChartAnnotations layout', () => {
  it('is kept while its inputs are, so reading a point, which re-renders the chart, does not place the text again', () => {
    const place = vi.spyOn(layout, 'layoutAnnotations')
    const { rerender } = render(
      <svg>
        <ChartAnnotations annotations={ANNOTATIONS} size={SIZE} />
      </svg>,
    )
    rerender(
      <svg>
        <ChartAnnotations annotations={ANNOTATIONS} size={SIZE} />
      </svg>,
    )
    expect(place).toHaveBeenCalledTimes(1)
  })

  it('is made again when the chart’s size changes', () => {
    const place = vi.spyOn(layout, 'layoutAnnotations')
    const { rerender } = render(
      <svg>
        <ChartAnnotations annotations={ANNOTATIONS} size={SIZE} />
      </svg>,
    )
    rerender(
      <svg>
        <ChartAnnotations
          annotations={ANNOTATIONS}
          size={{ ...SIZE, width: 600, plot: { ...SIZE.plot, right: 584 } }}
        />
      </svg>,
    )
    expect(place).toHaveBeenCalledTimes(2)
  })
})
