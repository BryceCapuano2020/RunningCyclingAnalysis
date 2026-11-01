// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SectionDisclosure } from './SectionDisclosure'

afterEach(cleanup)

function renderDisclosure() {
  return render(
    <SectionDisclosure
      id="run-section-x"
      title="At the same heart rate"
      finding="You run 6 s/km faster than in March"
    >
      <p>The chart</p>
    </SectionDisclosure>,
  )
}

describe('SectionDisclosure', () => {
  it('is a named region whose row says the section’s name and its finding', () => {
    renderDisclosure()
    const region = screen.getByRole('region', { name: 'At the same heart rate' })
    const summary = region.querySelector('summary')!
    expect(within(summary).getByText('At the same heart rate')).toBeInTheDocument()
    expect(within(summary).getByText('You run 6 s/km faster than in March')).toBeInTheDocument()
  })

  it('is open to start with, and shows its content', () => {
    renderDisclosure()
    expect(screen.getByRole('region').querySelector('details')).toHaveAttribute('open')
    expect(screen.getByText('The chart')).toBeInTheDocument()
  })

  it('keeps its content mounted when the reader folds it and opens it again', () => {
    renderDisclosure()
    const details = screen.getByRole('region').querySelector('details')!
    details.open = false
    fireEvent(details, new Event('toggle'))
    expect(screen.getByText('The chart')).toBeInTheDocument()
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(screen.getByText('The chart')).toBeInTheDocument()
  })

  it('marks a section whose body says its finding already, so the row says it only when folded', () => {
    const { container } = render(
      <SectionDisclosure
        id="x"
        title="Durability"
        finding="Best 20 min held 94% after 90 min"
        restated
      >
        <p>The chart</p>
      </SectionDisclosure>,
    )
    expect(container.querySelector('section')).toHaveAttribute('data-restated')
    cleanup()
    renderDisclosure()
    expect(screen.getByRole('region')).not.toHaveAttribute('data-restated')
  })

  it('carries the id the “On this page” row scrolls to, on the element that opens', () => {
    const { container } = renderDisclosure()
    expect(container.querySelector('details#run-section-x')).not.toBeNull()
  })
})
