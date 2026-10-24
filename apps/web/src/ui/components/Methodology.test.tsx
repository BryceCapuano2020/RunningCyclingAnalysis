// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import {
  DEFAULT_WINDOW_DAYS,
  EFFORT_LENGTHS_S,
  MIN_WINDOW_DAYS,
} from '@rca/core/digest/trendPoints'
import { RIDE_MAX_OFFSET_BPM } from '@rca/core/effort'
import { Methodology } from './Methodology'

afterEach(() => {
  cleanup()
})

/** The effort lengths in minutes, as the copy names them: "5, 20 or 60 minutes". */
const EFFORT_MINUTES = EFFORT_LENGTHS_S.map((durationS) => durationS / 60)
const EFFORT_PHRASE = `${EFFORT_MINUTES.slice(0, -1).join(', ')} or ${EFFORT_MINUTES.at(-1)} minutes`

describe('Methodology', () => {
  it('is a collapsed details card with the methodology title', () => {
    const { container } = render(<Methodology />)
    const details = container.querySelector('details')
    expect(details).not.toBeNull()
    expect(details).not.toHaveAttribute('open')
    expect(
      screen.getByRole('heading', { level: 2, name: 'How this works and what it assumes' }),
    ).toBeInTheDocument()
  })

  it('puts the title in an h2 inside the summary, with no custom summary class', () => {
    const { container } = render(<Methodology />)
    const summary = container.querySelector('details > summary')
    expect(summary).not.toBeNull()
    expect(summary?.className).toBe('')
    expect(summary?.querySelector('h2')).toHaveTextContent('How this works and what it assumes')
  })

  it('has a plain-language section for each assumption', () => {
    render(<Methodology />)
    for (const title of [
      'One unit for both sports',
      'Why there is a range',
      'Heart-rate check',
      'Virtual power meter',
      'Data checks',
      'Limits',
    ]) {
      expect(screen.getByRole('heading', { level: 3, name: title })).toBeInTheDocument()
    }
  })

  it('says which speed a GPX, TCX or GPS-only file uses, and where GPS is less reliable', () => {
    render(<Methodology />)
    const heading = screen.getByRole('heading', { level: 3, name: 'Where speed comes from' })
    const body = heading.nextElementSibling
    expect(body).toHaveTextContent('A TCX file with device speed uses that speed.')
    expect(body).toHaveTextContent('centred difference over 10 seconds either side of each point')
    expect(body).toHaveTextContent('GPX files never carry device speed')
    expect(body).toHaveTextContent('a centred window of 20 seconds')
    expect(body).toHaveTextContent('more than twice the sport’s maximum speed rejected')
    expect(body).toHaveTextContent('a gap longer than 30 seconds crediting no distance')
    expect(body).toHaveTextContent('Speeds below 0.5 m/s count as still.')
    expect(body).toHaveTextContent('Short best efforts under about 30 seconds from GPS-only files')
  })

  it('explains the fitness trend: prior means, the headline median, gaps and the period', () => {
    render(<Methodology />)
    const heading = screen.getByRole('heading', { level: 3, name: 'Fitness over time' })
    const body = heading.nextElementSibling
    expect(body).toHaveTextContent('prior-mean efficiency and running economy')
    expect(body).toHaveTextContent('median of the model draws')
    expect(body).toHaveTextContent('no run or ride with an effort of that length')
    expect(body).toHaveTextContent(`(${EFFORT_PHRASE}; Balance uses ${HEADLINE_DURATION_S / 60})`)
    expect(body).toHaveTextContent(`${DEFAULT_WINDOW_DAYS} days over all time`)
    expect(body).toHaveTextContent(
      `at least ${MIN_WINDOW_DAYS} days and at most ${DEFAULT_WINDOW_DAYS} days`,
    )
    expect(body).toHaveTextContent('Each window lies inside the selected period')
    expect(body).toHaveTextContent('priced with the selected period’s one bike model')
    expect(body).toHaveTextContent('bike model is fitted on the activities in the selected period')
  })

  it('states the average gross efficiency and the 90% range', () => {
    render(<Methodology />)
    expect(screen.getByText(/about 21\.5%/)).toBeInTheDocument()
    expect(screen.getByText(/90% range/)).toBeInTheDocument()
  })

  it('says air density follows the altitude in the file, with sea level as the fallback', () => {
    render(<Methodology />)
    const heading = screen.getByRole('heading', { level: 3, name: 'Virtual power meter' })
    expect(heading.nextElementSibling).toHaveTextContent(
      'Air density follows altitude from the file (ISA, 15 °C), with sea level when altitude is missing or the ride is indoors.',
    )
  })

  it('says heart-rate checks build each reference from the sports’ highest sustained heart rates, with the cycling offset', () => {
    render(<Methodology />)
    const heading = screen.getByRole('heading', { level: 3, name: 'Heart-rate check' })
    expect(heading.nextElementSibling).toHaveTextContent(
      'Heart-rate checks judge each sport’s best efforts against a reference maximum built from each sport’s highest sustained heart rate.',
    )
    expect(heading.nextElementSibling).toHaveTextContent(
      `Running uses the higher of its own maximum and the cycling maximum. Cycling uses the higher of its own maximum and ${RIDE_MAX_OFFSET_BPM} bpm below the running maximum`,
    )
    expect(heading.nextElementSibling).toHaveTextContent(
      `it is never more than ${RIDE_MAX_OFFSET_BPM} bpm below running`,
    )
  })

  it('defines the energy rate once, as gross metabolic power in W/kg, and uses it elsewhere', () => {
    const { container } = render(<Methodology />)
    const text = container.textContent ?? ''
    expect(text.match(/gross metabolic/g)).toHaveLength(1)
    expect(text).toContain('energy rate (gross metabolic power, W/kg)')
    expect(text).not.toMatch(/gross metabolic W\/kg/)
  })

  it('says the model is fitted to all power-meter rides and its accuracy is scored leave-one-out', () => {
    render(<Methodology />)
    const heading = screen.getByRole('heading', { level: 3, name: 'Virtual power meter' })
    const body = heading.nextElementSibling
    expect(body).toHaveTextContent(
      'Power is estimated on climbs from speed, gradient and weight using a model fitted to your power-meter rides; its accuracy is scored on each ride with that ride left out of the fit.',
    )
    expect(body?.textContent).not.toMatch(/tuned on your other/)
  })
})
