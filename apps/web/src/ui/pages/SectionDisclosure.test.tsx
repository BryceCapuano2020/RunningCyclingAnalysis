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
  it('is a named region whose closed row says the section’s name and its finding', () => {
    renderDisclosure()
    const region = screen.getByRole('region', { name: 'At the same heart rate' })
    const summary = region.querySelector('summary')!
    expect(within(summary).getByText('At the same heart rate')).toBeInTheDocument()
    expect(within(summary).getByText('You run 6 s/km faster than in March')).toBeInTheDocument()
  })

  it('is closed, and mounts nothing until it is opened', () => {
    renderDisclosure()
    expect(screen.getByRole('region').querySelector('details')).not.toHaveAttribute('open')
    expect(screen.queryByText('The chart')).toBeNull()
  })

  it('mounts its content when it opens, and keeps it mounted when it closes', () => {
    renderDisclosure()
    const details = screen.getByRole('region').querySelector('details')!
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(screen.getByText('The chart')).toBeInTheDocument()
    details.open = false
    fireEvent(details, new Event('toggle'))
    expect(screen.getByText('The chart')).toBeInTheDocument()
  })

  it('carries the id the “On this page” row scrolls to, on the element that opens', () => {
    const { container } = renderDisclosure()
    expect(container.querySelector('details#run-section-x')).not.toBeNull()
  })
})
