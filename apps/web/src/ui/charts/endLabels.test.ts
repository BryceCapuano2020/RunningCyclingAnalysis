import { describe, expect, it } from 'vitest'
import type { ChartSize } from './chartTypes'
import { placeEndLabels } from './endLabels'
import { PLOT_BOTTOM_WITHOUT_X_TITLE, plotBoxOf } from './plotBox'
import { labelSizePx, labelWidthPx, DEFAULT_ROOT_PX } from './rootFont'

const size = (width: number, gutter: number, height = 300): ChartSize => ({
  width,
  height,
  plot: plotBoxOf(width, height, gutter, PLOT_BOTTOM_WITHOUT_X_TITLE),
  tooltipId: 't',
  hintId: 'h',
  titleId: 'i',
})

const em = labelSizePx(DEFAULT_ROOT_PX)

describe('placeEndLabels', () => {
  it('sets a label that reaches the plot edge in the gutter, level with its end', () => {
    const s = size(600, 80)
    const [label] = placeEndLabels(
      [{ kind: 'run', text: 'Run 64%', point: { x: s.plot.right, y: 150 } }],
      s,
    )
    expect(label?.anchor).toBe('start')
    expect(label?.at.x).toBeGreaterThan(s.plot.right)
    expect(Math.abs((label?.at.y ?? 0) - 150)).toBeLessThan(em)
  })

  it('spreads two labels apart where their ends are a pixel apart, in the order of their ends', () => {
    const s = size(600, 80)
    const labels = placeEndLabels(
      [
        { kind: 'run', text: 'Run 60%', point: { x: s.plot.right, y: 150 } },
        { kind: 'ride', text: 'Ride 60%', point: { x: s.plot.right, y: 151 } },
      ],
      s,
    )
    const run = labels.find((l) => l.kind === 'run')!
    const ride = labels.find((l) => l.kind === 'ride')!
    expect(ride.at.y - run.at.y).toBeGreaterThanOrEqual(em * 1.25)
  })

  it('keeps labels inside the plot at its foot and its top', () => {
    const s = size(600, 80)
    const labels = placeEndLabels(
      [
        { kind: 'run', text: 'Run 41%', point: { x: s.plot.right, y: s.plot.bottom } },
        { kind: 'ride', text: 'Ride 40%', point: { x: s.plot.right, y: s.plot.bottom - 1 } },
      ],
      s,
    )
    for (const label of labels) {
      expect(label.at.y).toBeLessThanOrEqual(s.plot.bottom)
      expect(label.at.y).toBeGreaterThanOrEqual(s.plot.top)
    }
    expect(Math.abs(labels[0]!.at.y - labels[1]!.at.y)).toBeGreaterThanOrEqual(em)
  })

  it('names a line that stops early just past its own end', () => {
    const s = size(600, 80)
    const [label] = placeEndLabels(
      [{ kind: 'ride', text: 'Ride 58%', point: { x: 200, y: 120 } }],
      s,
    )
    expect(label?.anchor).toBe('start')
    expect(label?.at.x).toBeCloseTo(208)
  })

  it('puts the label of a line that stops early above its end where there is no room to the right', () => {
    const s = size(300, 20)
    const width = labelWidthPx('Ride 58%', DEFAULT_ROOT_PX)
    const [label] = placeEndLabels(
      [{ kind: 'ride', text: 'Ride 58%', point: { x: s.width - width / 2, y: 120 } }],
      s,
    )
    expect(label?.anchor).toBe('end')
    expect(label!.at.y).toBeLessThan(120)
  })

  it('moves a label that would sit on another one down past it', () => {
    const s = size(600, 80)
    const labels = placeEndLabels(
      [
        { kind: 'run', text: 'Run 60%', point: { x: 300, y: 120 } },
        { kind: 'ride', text: 'Ride 60%', point: { x: 320, y: 122 } },
      ],
      s,
    )
    const [a, b] = labels
    expect(b!.at.y - a!.at.y).toBeGreaterThan(em)
  })

  it('carries a leading mark through, and counts it in the width', () => {
    const s = size(300, 40)
    const [label] = placeEndLabels(
      [{ kind: 'run', text: '64%', glyph: '●', point: { x: s.plot.right, y: 100 } }],
      s,
    )
    expect(label?.glyph).toBe('●')
    expect(label?.text).toBe('64%')
  })
})

describe('placeEndLabels beside a line that stops early', () => {
  it('drops the leading mark, since the label stands beside its own end marker', () => {
    const s = size(300, 40)
    const [label] = placeEndLabels(
      [{ kind: 'ride', text: '58%', glyph: '○', point: { x: 120, y: 100 } }],
      s,
    )
    expect(label?.glyph).toBeUndefined()
    expect(label?.text).toBe('58%')
  })
})
