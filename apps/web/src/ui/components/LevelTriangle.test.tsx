// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Grade } from '@rca/core/grade'
import type { TriangleGrade } from '@rca/core/standing'
import { NO_TRIANGLE_GRADES } from '@rca/core/standing'
import { EMPTY_TRIANGLE } from '../triangleSports'
import type { TriangleView } from '../triangleSports'
import { LevelTriangle } from './LevelTriangle'

afterEach(cleanup)

const at = (percent: number): Grade => ({ grade: (percent + 0.04) / 100, level: 'x' })
const graded = (percent: number, spread = 0): TriangleGrade => ({
  kind: 'graded',
  grade: {
    centre: at(percent),
    range: spread === 0 ? null : { low: at(percent - spread), high: at(percent + spread) },
  },
})
const gap: TriangleGrade = { kind: 'gap' }
const view = (run: TriangleGrade, ride: TriangleGrade, lift: TriangleGrade): TriangleView => ({
  grades: { run, ride, lift },
  notes: {},
})

describe('LevelTriangle', () => {
  it('draws the figure as decoration and puts the corners over it in the rail’s order', () => {
    const { container } = render(
      <LevelTriangle view={view(graded(61, 6), graded(52, 6), graded(48, 6))} />,
    )
    const plot = container.querySelector('svg')!
    expect(plot).toHaveAttribute('aria-hidden', 'true')
    // The SVG's one text is the two ring numbers.
    expect([...plot.querySelectorAll('text')].map((text) => text.textContent)).toEqual(['80', '60'])
    const corners = [...container.querySelectorAll('.level-triangle__corner')]
    expect(corners.map((corner) => corner.getAttribute('data-sport'))).toEqual([
      'run',
      'ride',
      'lift',
    ])
    expect(
      plot.compareDocumentPosition(corners[0]!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('reads each corner as its sport, its grade and its level, with the range for a screen reader', () => {
    render(<LevelTriangle view={view(graded(61, 6), graded(52, 6), graded(48, 6))} />)
    const run = screen.getByRole('link', { name: /^Running 61% Local, range 55 to 67$/ })
    expect(run).toHaveAttribute('href', '#/run')
    expect(
      screen.getByRole('link', { name: /^Cycling 52% Recreational, range 46 to 58$/ }),
    ).toHaveAttribute('href', '#/ride')
    expect(run.querySelector('.sr-only')).toHaveTextContent(', range 55 to 67')
  })

  it('draws a dot, a band and the closed shape for three grades, with no cap', () => {
    const { container } = render(
      <LevelTriangle view={view(graded(61, 6), graded(52, 6), graded(48, 6))} />,
    )
    expect(container.querySelectorAll('.level-triangle__dot')).toHaveLength(3)
    // The band is layered twice, as the meter's was.
    expect(container.querySelectorAll('.level-triangle__band')).toHaveLength(6)
    expect(container.querySelectorAll('polygon.level-triangle__shape')).toHaveLength(1)
    expect(container.querySelector('.level-triangle__line')).toBeNull()
    expect(container.querySelector('.level-triangle__cap')).toBeNull()
  })

  it('draws two grades as a line with no fill and the third axis lighter, capped and with no dot', () => {
    const { container } = render(<LevelTriangle view={view(graded(61, 6), graded(52, 6), gap)} />)
    expect(container.querySelectorAll('.level-triangle__dot')).toHaveLength(2)
    expect(container.querySelector('.level-triangle__shape')).toBeNull()
    expect(container.querySelector('.level-triangle__line')).not.toBeNull()
    expect(container.querySelectorAll('.level-triangle__axis--empty')).toHaveLength(1)
    expect(container.querySelectorAll('.level-triangle__cap')).toHaveLength(1)
    expect(container.querySelector('.level-triangle__corner[data-sport="lift"]')).toHaveTextContent(
      'Lifting No grade yet',
    )
  })

  it('draws one grade as a dot alone, and none as the axes and rings empty', () => {
    const one = render(<LevelTriangle view={view(graded(61), gap, gap)} />)
    expect(one.container.querySelectorAll('.level-triangle__dot')).toHaveLength(1)
    expect(one.container.querySelector('.level-triangle__shape, .level-triangle__line')).toBeNull()
    cleanup()
    const none = render(<LevelTriangle view={EMPTY_TRIANGLE} />)
    expect(none.container.querySelectorAll('.level-triangle__dot')).toHaveLength(0)
    expect(none.container.querySelectorAll('.level-triangle__none')).toHaveLength(3)
    expect(none.container.querySelectorAll('polygon.level-triangle__ring')).toHaveLength(3)
  })

  it('says what a corner’s missing grade is when the page has a note, and still links to its page', () => {
    render(
      <LevelTriangle
        view={{ grades: NO_TRIANGLE_GRADES, notes: { ride: 'At the top of the age tables' } }}
      />,
    )
    expect(screen.getByText('At the top of the age tables')).toBeInTheDocument()
    expect(screen.getAllByText('No grade yet')).toHaveLength(2)
    expect(screen.getAllByRole('link')).toHaveLength(3)
  })

  it('places each corner on its vertex as a share of the plot', () => {
    const { container } = render(<LevelTriangle view={EMPTY_TRIANGLE} />)
    const [run, ride, lift] = [
      ...container.querySelectorAll<HTMLElement>('.level-triangle__corner'),
    ]
    expect(run?.style.getPropertyValue('--x')).toBe('50%')
    expect(run?.getAttribute('data-at')).toBe('top')
    expect(ride?.getAttribute('data-at')).toBe('bottom')
    expect(
      parseFloat(ride!.style.getPropertyValue('--x')) +
        parseFloat(lift!.style.getPropertyValue('--x')),
    ).toBeCloseTo(100)
  })
})
