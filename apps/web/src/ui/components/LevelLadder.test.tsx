// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Grade, SportGrade } from '../grades'
import { LevelLadder } from './LevelLadder'

afterEach(() => {
  cleanup()
})

function gradeAt(percent: number, level: string): Grade {
  return { grade: percent / 100, level }
}

const RUN: SportGrade = { centre: gradeAt(67.6, 'Local'), range: null }
const RIDE: SportGrade = {
  centre: gradeAt(67.6, 'Local'),
  range: { low: gradeAt(63, 'Local'), high: gradeAt(71.5, 'Regional') },
}

describe('LevelLadder', () => {
  it('names a run as one activity’s estimate, with its level and the standard', () => {
    render(<LevelLadder sport="run" grade={RUN} />)
    expect(
      screen.getByRole('img', {
        name: 'Estimated age grade 67%, Local, from one activity, on the USATF road standards.',
      }),
    ).toBeInTheDocument()
  })

  it('names a ride with its range, not with a single activity', () => {
    render(<LevelLadder sport="ride" grade={RIDE} />)
    expect(
      screen.getByRole('img', {
        name: 'Estimated age grade 67%, Local, range 63% to 71%, on the USATF road standards.',
      }),
    ).toBeInTheDocument()
  })

  it('says a grade below the scale is below it, not that it sits at the 30% edge', () => {
    render(<LevelLadder sport="run" grade={{ centre: gradeAt(25, 'Recreational'), range: null }} />)
    expect(
      screen.getByRole('img', {
        name: 'Estimated age grade 25%, Recreational, from one activity, below the 30% to 100% scale, on the USATF road standards.',
      }),
    ).toBeInTheDocument()
  })

  it('says a grade above the scale is above it', () => {
    render(<LevelLadder sport="run" grade={{ centre: gradeAt(310, 'World'), range: null }} />)
    expect(
      screen.getByRole('img', { name: /, above the 30% to 100% scale, on the USATF/ }),
    ).toBeInTheDocument()
  })

  it('shows each band name once, from the lowest band up, and the scale’s percentages', () => {
    render(<LevelLadder sport="run" grade={RUN} />)
    const names = ['Recreational', 'Local', 'Regional', 'National', 'World'].map((name) =>
      screen.getByText(name),
    )
    names.slice(1).forEach((name, index) => {
      expect(names[index]!.compareDocumentPosition(name)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })
    for (const percent of ['30%', '60%', '70%', '80%', '90%']) {
      expect(screen.getByText(percent)).toBeInTheDocument()
    }
  })
})

/** The drawing's width, from its viewBox: the shapes are placed as fractions of it. */
function drawingWidth(container: HTMLElement): number {
  const width = Number(container.querySelector('svg')?.getAttribute('viewBox')?.split(' ')[2])
  if (!width) throw new Error('The ladder has no drawing width')
  return width
}

/** Where a shape's attribute falls across the drawing, as a fraction from 0 (left) to 1 (right). */
function fraction(container: HTMLElement, selector: string, attribute: string): number {
  const shape = container.querySelector(selector)
  if (shape === null) throw new Error(`No ${selector} in the ladder`)
  return Number(shape.getAttribute(attribute)) / drawingWidth(container)
}

/** The scale is 30% to 100%, so a grade's place along it is (grade - 30) / 70. */
const SCALE_FRACTION = (grade: number) => (grade - 0.3) / 0.7

describe('LevelLadder shapes', () => {
  it('draws one activity’s estimate as a solid dot, and a ride’s model range as a ring', () => {
    const run = render(<LevelLadder sport="run" grade={RUN} />)
    expect(run.container.querySelector('.level-ladder__dot')).not.toBeNull()
    expect(run.container.querySelector('.level-ladder__ring')).toBeNull()
    expect(run.container.querySelector('.level-ladder__range')).toBeNull()
    run.unmount()

    const ride = render(<LevelLadder sport="ride" grade={RIDE} />)
    expect(ride.container.querySelector('.level-ladder__ring')).not.toBeNull()
    expect(ride.container.querySelector('.level-ladder__dot')).toBeNull()
    expect(ride.container.querySelector('.level-ladder__range')).not.toBeNull()
  })

  it('places the marker where the grade falls on the scale', () => {
    const { container } = render(<LevelLadder sport="run" grade={RUN} />)
    expect(fraction(container, '.level-ladder__dot', 'cx')).toBeCloseTo(SCALE_FRACTION(0.676), 2)
  })

  it('draws the range from its low end to its high end', () => {
    const { container } = render(<LevelLadder sport="ride" grade={RIDE} />)
    const left = fraction(container, '.level-ladder__range', 'x')
    const width = fraction(container, '.level-ladder__range', 'width')
    expect(left).toBeCloseTo(SCALE_FRACTION(0.63), 2)
    expect(left + width).toBeCloseTo(SCALE_FRACTION(0.715), 2)
  })

  it('holds a marker below the scale at its left end, and above it at its right end', () => {
    const below = render(
      <LevelLadder sport="run" grade={{ centre: gradeAt(10, 'Recreational'), range: null }} />,
    )
    expect(fraction(below.container, '.level-ladder__dot', 'cx')).toBe(0)
    below.unmount()

    const above = render(
      <LevelLadder sport="run" grade={{ centre: gradeAt(310, 'World'), range: null }} />,
    )
    expect(fraction(above.container, '.level-ladder__dot', 'cx')).toBe(1)
  })

  it('takes the sport’s colour from its class, so a run and a ride are drawn in their own', () => {
    const { container: run } = render(<LevelLadder sport="run" grade={RUN} />)
    expect(run.querySelector('.level-ladder--run')).not.toBeNull()
    expect(run.querySelector('.level-ladder--ride')).toBeNull()
    cleanup()

    const { container: ride } = render(<LevelLadder sport="ride" grade={RIDE} />)
    expect(ride.querySelector('.level-ladder--ride')).not.toBeNull()
    expect(ride.querySelector('.level-ladder--run')).toBeNull()
  })
})

describe('LevelLadder layering', () => {
  it('draws the range before the first band edge, so the edges sit on top of it', () => {
    const { container } = render(<LevelLadder sport="ride" grade={RIDE} />)
    const range = container.querySelector('.level-ladder__range')
    const firstEdge = container.querySelector('.level-ladder__edge')
    if (range === null || firstEdge === null) throw new Error('The ladder lacks a range or an edge')
    expect(range.compareDocumentPosition(firstEdge)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })
})
