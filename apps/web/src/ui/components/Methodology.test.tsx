// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { DEFAULT_WINDOW_DAYS, MIN_WINDOW_DAYS } from '@rca/core/digest/trendPoints'
import { Methodology } from './Methodology'

afterEach(() => {
  cleanup()
})

/** The text of the plain-words paragraph under a topic's heading. */
function plainOf(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { level: 3, name: title })
  const section = heading.closest('section')
  if (!section) throw new Error(`No section under ${title}`)
  return section
}

describe('Methodology', () => {
  it('has the title as a heading outside a disclosure, so the summary holds no heading', () => {
    const { container } = render(<Methodology />)

    expect(
      screen.getByRole('heading', { level: 2, name: 'How this works and what it assumes' }),
    ).toBeInTheDocument()
    const summary = container.querySelector('details > summary')
    expect(summary).not.toBeNull()
    expect(summary?.querySelector('h2, h3')).toBeNull()
  })

  it('is collapsed by default, and opens when asked', () => {
    const { container, unmount } = render(<Methodology />)
    expect(container.querySelector('details')).not.toHaveAttribute('open')
    unmount()

    const opened = render(<Methodology open />)
    expect(opened.container.querySelector('details')).toHaveAttribute('open')
  })

  it('lists every topic when no list is given, in order', () => {
    render(<Methodology />)

    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent)
    expect(headings).toEqual([
      'One unit for both sports',
      'Why there is a range',
      'Best 20 min, week by week',
      'Heart-rate check',
      'Virtual power meter',
      'Data checks',
      'Where speed comes from',
      'Limits',
    ])
  })

  it('lists only the topics it is given', () => {
    render(<Methodology topics={['trend', 'limits']} />)

    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2)
    expect(
      screen.getByRole('heading', { level: 3, name: 'Best 20 min, week by week' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Heart-rate check' })).not.toBeInTheDocument()
  })

  it('puts each technical detail behind a named More detail disclosure', () => {
    const { container } = render(<Methodology topics={['speed']} />)

    const detail = container.querySelector('details.methodology__detail')
    expect(detail).not.toBeNull()
    expect(detail?.querySelector('summary')).toHaveTextContent(
      'More detail: Where speed comes from',
    )
  })

  it('says which speed a GPX, TCX or GPS-only file uses, and where GPS is less reliable', () => {
    render(<Methodology topics={['speed']} />)

    const section = plainOf('Where speed comes from')
    expect(section).toHaveTextContent('A file that records speed uses that speed.')
    expect(section).toHaveTextContent(
      'the change in distance over the 10 s either side of each point (a centred difference)',
    )
    expect(section).toHaveTextContent('GPX files never carry device speed')
    expect(section).toHaveTextContent('a 20 s window centred on each point')
    expect(section).toHaveTextContent('more than twice the sport’s maximum speed')
    expect(section).toHaveTextContent('credits no distance across a gap longer than 30 s')
    expect(section).toHaveTextContent('Speeds below 0.5 m/s count as still.')
    expect(section).toHaveTextContent('Short best efforts under about 30 s')
  })

  it('explains the fitness trend in three plain facts, in durations written one way', () => {
    render(<Methodology topics={['trend']} />)

    const section = plainOf('Best 20 min, week by week')
    expect(section).toHaveTextContent('one week, ending on a Sunday in UTC')
    expect(section).toHaveTextContent('5 min, 20 min or 60 min')
    expect(section).toHaveTextContent(`Balance uses ${HEADLINE_DURATION_S / 60} min.`)
    expect(section).toHaveTextContent(`All time uses ${DEFAULT_WINDOW_DAYS} days.`)
    expect(section).toHaveTextContent(
      `a third of the period’s length, kept between ${MIN_WINDOW_DAYS} and ${DEFAULT_WINDOW_DAYS} days`,
    )
    // The example periods are the picker's own options, with the window the trend really uses.
    expect(section).toHaveTextContent(
      '6 weeks uses 14 days, 3 months uses 30 days and last 12 months uses 42 days.',
    )
    expect(section).toHaveTextContent('Each window lies inside the period you chose.')
    expect(section).toHaveTextContent(
      'A gap means no run or ride of that length fell inside the window.',
    )
    expect(section.querySelectorAll(':scope > p')).toHaveLength(3)
  })

  it('keeps the technical trend detail, with the median and the bike model, behind the disclosure', () => {
    render(<Methodology topics={['trend']} />)

    const detail = plainOf('Best 20 min, week by week').querySelector('details')
    expect(detail).toHaveTextContent('the median, the middle of the model’s simulated answers')
    expect(detail).toHaveTextContent('period’s one bike model')
    expect(plainOf('Best 20 min, week by week')).toHaveTextContent(
      'Running is shown as flat pace: your pace allowing for hills, as if on level ground, and cycling as power in watts.',
    )
  })

  it('does not say "priced" or use the unexplained terms of the old copy', () => {
    const { container } = render(<Methodology />)
    const text = container.textContent ?? ''

    expect(text).not.toMatch(/priced|prior-mean|draws|centred difference over 10 seconds\)/)
    expect(text).not.toMatch(/\bminutes\b/)
  })

  it('explains the heart-rate reference and the cycling offset, in beats per minute', () => {
    render(<Methodology topics={['heart']} />)

    const section = plainOf('Heart-rate check')
    expect(section).toHaveTextContent(
      'Heart rate is used to check the model, not to measure fitness.',
    )
    const detail = section.querySelector('details')
    expect(detail).toHaveTextContent('beats per minute (bpm)')
    expect(detail).toHaveTextContent(
      'Running uses the higher of its own maximum and the cycling maximum.',
    )
    expect(detail).toHaveTextContent(
      'Cycling uses the higher of its own maximum and 6 bpm below the running maximum',
    )
    expect(detail).toHaveTextContent('5 to 7 bpm lower')
  })

  it('says air density follows the altitude in the file, with sea level as the fallback', () => {
    render(<Methodology topics={['virtual']} />)

    expect(plainOf('Virtual power meter').querySelector('details')).toHaveTextContent(
      'Air density follows the altitude in the file, using the International Standard Atmosphere (ISA, 15 °C at sea level).',
    )
  })

  it('says the virtual power estimate is fitted to power-meter rides and checked leave-one-out', () => {
    render(<Methodology topics={['virtual']} />)

    expect(plainOf('Virtual power meter')).toHaveTextContent(
      'The model is fitted to your rides that have a power meter, and its accuracy is checked on each ride with that ride left out of the fit.',
    )
  })

  it('states the efficiency and running-economy spread, and that a range is not a percentile', () => {
    render(<Methodology topics={['range', 'unit']} />)

    expect(plainOf('Why there is a range')).toHaveTextContent(
      'the range is not a fitness percentile',
    )
    const detail = plainOf('Why there is a range').querySelector('details')
    expect(detail).toHaveTextContent('by about 7%, and running economy by about 8%')
    // The range and its limits are defined once, on How sure is this?, so this topic refers back.
    expect(detail?.textContent).not.toMatch(/every source of|sensor error|90% range summarises/)
    expect(detail).toHaveTextContent('The energy view above says what the range is')
    expect(plainOf('One unit for both sports').querySelector('details')).toHaveTextContent(
      'Gross efficiency averages about 21.5%.',
    )
  })
})

describe('Methodology topic copy', () => {
  it('uses British spelling in every topic', () => {
    const { container } = render(<Methodology />)
    const text = container.textContent ?? ''

    expect(text).toMatch(/centred/)
    expect(text).not.toMatch(/\b(centered|summarizes|analyze|color|kilometer)\w*/i)
  })

  it('never calls a level or a balance weak, a limiter or ahead', () => {
    const { container } = render(<Methodology />)
    expect(within(container).queryByText(/\b(ahead of|limiter|weak|strength)\b/i)).toBeNull()
  })
})
