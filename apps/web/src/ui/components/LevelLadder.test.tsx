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
  it('names a run as one recorded effort at the headline duration, with its level and the standard', () => {
    render(<LevelLadder sport="run" grade={RUN} />)
    expect(
      screen.getByRole('img', {
        name: 'Age grade 67%, Local, from your best 20 min, on the USATF road standards.',
      }),
    ).toBeInTheDocument()
  })

  it('names a ride as an estimate with its range, and names both levels when the range crosses one', () => {
    render(<LevelLadder sport="ride" grade={RIDE} />)
    expect(
      screen.getByRole('img', {
        name: 'Estimated age grade 67%, Local to Regional, from your best 20 min, range 63% to 71%, on the USATF road standards.',
      }),
    ).toBeInTheDocument()
  })

  it('says a grade below the scale is below it, not that it sits at the 30% edge', () => {
    render(<LevelLadder sport="run" grade={{ centre: gradeAt(25, 'Recreational'), range: null }} />)
    expect(
      screen.getByRole('img', {
        name: 'Age grade 25%, Recreational, from your best 20 min, below the 30% to 100% scale, on the USATF road standards.',
      }),
    ).toBeInTheDocument()
  })

  it('fills and names both bands when a ride range crosses a band edge', () => {
    const { container } = render(<LevelLadder sport="ride" grade={RIDE} />)
    expect(container.querySelectorAll('.level-ladder__band--current')).toHaveLength(2)
    const names = Array.from(
      container.querySelectorAll('.level-ladder__name--current'),
      (el) => el.textContent,
    )
    expect(names).toEqual(['Local', 'Regional'])
  })

  it('explains the solid dot for a run and the ring for a ride, in words beside the drawing', () => {
    const run = render(<LevelLadder sport="run" grade={RUN} />)
    expect(run.getByText('Solid dot: the grade of one recorded effort.')).toBeInTheDocument()
    run.unmount()

    render(<LevelLadder sport="ride" grade={RIDE} />)
    expect(screen.getByText('Ring: estimated, with its range.')).toBeInTheDocument()
  })

  it('says in its key when a grade sits below the scale', () => {
    render(<LevelLadder sport="run" grade={{ centre: gradeAt(25, 'Recreational'), range: null }} />)
    expect(screen.getByText(/Below the 30% to 100% scale\./)).toBeInTheDocument()
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

  it('keeps a marker below the scale inside the track, at its left end, and one above it at its right end', () => {
    const below = render(
      <LevelLadder sport="run" grade={{ centre: gradeAt(10, 'Recreational'), range: null }} />,
    )
    // The dot's radius plus half its stroke, so its outline stays inside the track at each end.
    const clearOfEdge = (8 + 1) / 320
    expect(fraction(below.container, '.level-ladder__dot', 'cx')).toBeCloseTo(clearOfEdge, 4)
    below.unmount()

    const above = render(
      <LevelLadder sport="run" grade={{ centre: gradeAt(310, 'World'), range: null }} />,
    )
    expect(fraction(above.container, '.level-ladder__dot', 'cx')).toBeCloseTo(1 - clearOfEdge, 4)
  })

  it('fills the band that holds the grade, and names that band in bold', () => {
    const { container } = render(<LevelLadder sport="run" grade={RUN} />)
    const current = container.querySelectorAll('.level-ladder__band--current')
    expect(current).toHaveLength(1)
    expect(fraction(container, '.level-ladder__band--current', 'x')).toBeCloseTo(
      SCALE_FRACTION(0.6),
      2,
    )
    expect(container.querySelector('.level-ladder__name--current')).toHaveTextContent('Local')
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

describe('LevelLadder off the scale', () => {
  it('draws a chevron beside the marker at the bar end that a grade lies past', () => {
    const below = render(
      <LevelLadder sport="run" grade={{ centre: gradeAt(25, 'Recreational'), range: null }} />,
    )
    expect(below.container.querySelector('.level-ladder__beyond')).toHaveAttribute(
      'data-side',
      'below',
    )
    below.unmount()

    const above = render(
      <LevelLadder sport="run" grade={{ centre: gradeAt(310, 'World'), range: null }} />,
    )
    expect(above.container.querySelector('.level-ladder__beyond')).toHaveAttribute(
      'data-side',
      'above',
    )
  })

  it('draws the chevron just outside the bar end it points past, so it never sits on the marker', () => {
    const above = render(
      <LevelLadder
        sport="ride"
        grade={{
          centre: gradeAt(96, 'National'),
          range: { low: gradeAt(87, 'National'), high: gradeAt(107, 'World') },
        }}
      />,
    )
    // The path reads "M edge y L tip y L edge y": the edge is the bar's end, the tip points past it.
    const [, edge, , , tip] = (
      above.container.querySelector('.level-ladder__beyond')?.getAttribute('d') ?? ''
    ).split(' ')
    expect(Number(edge)).toBe(320)
    expect(Number(tip)).toBeGreaterThan(320)
    above.unmount()

    const below = render(
      <LevelLadder sport="run" grade={{ centre: gradeAt(25, 'Recreational'), range: null }} />,
    )
    const [, belowEdge, , , belowTip] = (
      below.container.querySelector('.level-ladder__beyond')?.getAttribute('d') ?? ''
    ).split(' ')
    expect(Number(belowEdge)).toBe(0)
    expect(Number(belowTip)).toBeLessThan(0)
  })

  it('draws no chevron for a grade on the scale', () => {
    const { container } = render(<LevelLadder sport="run" grade={RUN} />)
    expect(container.querySelector('.level-ladder__beyond')).toBeNull()
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
