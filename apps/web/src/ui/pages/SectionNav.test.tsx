// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SectionDisclosure } from './SectionDisclosure'
import { goToSection } from './goToSection'
import { SectionNav } from './SectionNav'

afterEach(cleanup)

const scrolled: Element[] = []

beforeEach(() => {
  scrolled.length = 0
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolled.push(this)
  }
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
})

function renderPage() {
  return render(
    <>
      <SectionNav
        items={[
          { id: 'open-card', label: 'Race predictions' },
          { id: 'closed-card', label: 'Same heart rate' },
        ]}
      />
      <div id="open-card">
        <h2>Race predictions</h2>
      </div>
      <SectionDisclosure id="closed-card" title="At the same heart rate" finding="No clear change">
        <p>The chart</p>
      </SectionDisclosure>
    </>,
  )
}

describe('SectionNav', () => {
  it('is a navigation named On this page, with a button for each section', () => {
    renderPage()
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    expect(nav.querySelectorAll('button')).toHaveLength(2)
  })

  it('does not change the address: its entries are buttons, not links, since the app routes by hash', () => {
    renderPage()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('scrolls to an open section and puts the keyboard on its heading', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Race predictions' }))
    expect(scrolled).toEqual([document.getElementById('open-card')])
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Race predictions' }))
  })

  it('opens a closed section, mounting its content, and puts the keyboard on its summary', () => {
    renderPage()
    expect(screen.queryByText('The chart')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Same heart rate' }))
    const details = document.getElementById('closed-card') as HTMLDetailsElement
    expect(details.open).toBe(true)
    // The toggle event is the browser's; its handler mounts the content.
    fireEvent(details, new Event('toggle'))
    expect(screen.getByText('The chart')).toBeInTheDocument()
    expect(document.activeElement).toBe(details.querySelector('summary'))
  })

  it('scrolls without motion for a reader who asks for less', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    renderPage()
    goToSection('open-card')
    expect(spy).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
  })

  it('shows nothing for fewer than two sections, since there is nowhere to jump', () => {
    const { container } = render(<SectionNav items={[{ id: 'a', label: 'A' }]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('does nothing for a section that is not on the page', () => {
    expect(() => goToSection('missing')).not.toThrow()
  })
})
