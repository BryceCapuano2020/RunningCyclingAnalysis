// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TopicBody } from './TopicBody'

afterEach(() => {
  cleanup()
})

describe('TopicBody', () => {
  it('puts the technical detail behind a More detail disclosure named for the topic', () => {
    const { container } = render(<TopicBody id="heart" />)

    const detail = container.querySelector('details.more-detail')
    expect(detail).not.toBeNull()
    expect(detail).not.toHaveAttribute('open')
    expect(detail?.querySelector('summary')).toHaveTextContent('More detail: Heart-rate check')
  })

  it('sets the plain lines as paragraphs, each line its own sentence in a span', () => {
    const { container } = render(<TopicBody id="range" />)

    expect(screen.getByText('A file cannot show either one.')).toHaveClass('method__line')
    expect(screen.getByText('The range is not a fitness percentile.')).toBeInTheDocument()
    // Four short lines read as one paragraph, not four blocks.
    expect(container.querySelectorAll(':scope > p')).toHaveLength(1)
    expect(container.querySelectorAll(':scope > p > .method__line')).toHaveLength(4)
  })

  it('explains the heart-rate reference and the cycling offset, in beats per minute', () => {
    const { container } = render(<TopicBody id="heart" />)

    expect(screen.getByText('Heart rate checks the model.')).toBeInTheDocument()
    expect(screen.getByText('It does not measure fitness.')).toBeInTheDocument()
    const detail = container.querySelector('details')
    expect(detail).toHaveTextContent('beats per minute (bpm)')
    // The rule for each sport's reference is said once, in the facts under the check.
    expect(detail).not.toHaveTextContent('Running uses the higher of its own maximum')
    expect(detail).toHaveTextContent('5 to 7 bpm lower')
  })

  it('says air density follows the altitude in the file, with sea level as the fallback', () => {
    const { container } = render(<TopicBody id="virtual" />)

    expect(container.querySelector('details')).toHaveTextContent(
      'Air density follows the altitude in the file, using the International Standard Atmosphere (ISA, 15 °C at sea level).',
    )
    expect(container.querySelector('details')).toHaveTextContent(
      'Sea level is used when altitude is missing or the ride is indoors.',
    )
  })

  it('says the virtual power estimate is fitted to power-meter rides and checked leave-one-out', () => {
    render(<TopicBody id="virtual" />)

    expect(
      screen.getByText('The model is fitted to your rides that have a power meter.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Its accuracy is checked on each ride, with that ride left out of the fit.'),
    ).toBeInTheDocument()
  })

  it('states the efficiency and running-economy spread, and that a range is not a percentile', () => {
    const { container } = render(
      <>
        <TopicBody id="range" />
        <TopicBody id="unit" />
      </>,
    )

    expect(screen.getByText('The range is not a fitness percentile.')).toBeInTheDocument()
    const details = container.querySelectorAll('details')
    expect(details[0]).toHaveTextContent('Efficiency varies between people by about 7%.')
    expect(details[0]).toHaveTextContent('Running economy varies by about 8%.')
    // The range and its limits are defined once, on How sure is this?, so this topic refers back.
    expect(details[0]?.textContent).not.toMatch(/every source of|sensor error|90% range summarises/)
    expect(details[1]).toHaveTextContent('Gross efficiency averages about 21.5%.')
  })

  it('does not say "priced" or use the unexplained terms of the old copy, and uses British spelling', () => {
    const { container } = render(
      <>
        <TopicBody id="unit" />
        <TopicBody id="range" />
        <TopicBody id="heart" />
        <TopicBody id="virtual" />
      </>,
    )
    const text = container.textContent ?? ''

    expect(text).not.toMatch(/priced|prior-mean|draws|centred difference over 10 seconds\)/)
    expect(text).not.toMatch(/\bminutes\b/)
    expect(text).not.toMatch(/\b(centered|summarizes|analyze|color|kilometer)\w*/i)
    expect(text).not.toMatch(/\b(ahead of|limiter|weak|strength)\b/i)
  })
})
