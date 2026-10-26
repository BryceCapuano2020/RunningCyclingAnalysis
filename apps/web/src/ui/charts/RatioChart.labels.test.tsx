// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { comparisonFixture } from './fixtures'
import { RatioChart } from './RatioChart'

// Dense ticks on the percentage axis, so its labels collide and the axis must thin them. The zero line is
// the label that must survive, since it reads "Even".
vi.mock('./scale', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./scale')>()
  return {
    ...actual,
    niceDomain: () => ({
      domain: [-0.3, 0.3] as [number, number],
      ticks: Array.from({ length: 61 }, (_, i) => (i - 30) / 100),
    }),
  }
})

afterEach(() => {
  cleanup()
})

describe('RatioChart axis labels', () => {
  it('keeps the Even label on the axis when the labels around it are thinned away', () => {
    const { container } = render(<RatioChart comparison={comparisonFixture(false)} />)
    const labels = Array.from(container.querySelectorAll('.chart-y-axis__tick')).map(
      (tick) => tick.textContent,
    )
    expect(labels).toContain('Even')
  })
})
