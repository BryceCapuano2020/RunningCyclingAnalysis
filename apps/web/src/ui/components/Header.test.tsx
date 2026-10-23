// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Header } from './Header'

afterEach(() => {
  cleanup()
})

/** Whether the second element comes later in the page than the first. */
function follows(first: Element, second: Element): boolean {
  return (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

describe('Header', () => {
  it('links the wordmark home', () => {
    render(<Header route={null} />)
    expect(screen.getByRole('link', { name: 'RunningCyclingAnalysis' })).toHaveAttribute(
      'href',
      '#/',
    )
  })

  it('hides the tabs while there is nothing to navigate', () => {
    render(<Header route={null} />)
    expect(screen.queryByRole('navigation', { name: 'Sections' })).not.toBeInTheDocument()
  })

  it('shows the four tabs and marks the current one', () => {
    render(<Header route={{ page: 'ride' }} />)
    const tabs = within(screen.getByRole('navigation', { name: 'Sections' })).getAllByRole('link')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Balance', 'Run', 'Ride', 'Activities'])
    expect(screen.getByRole('link', { name: 'Ride' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Run' })).not.toHaveAttribute('aria-current')
  })

  it('marks Activities current on an activity page and Balance on the method page', () => {
    const { rerender } = render(<Header route={{ page: 'activity', id: 'a1' }} />)
    expect(screen.getByRole('link', { name: 'Activities' })).toHaveAttribute('aria-current', 'page')
    rerender(<Header route={{ page: 'method' }} />)
    expect(screen.getByRole('link', { name: 'Balance' })).toHaveAttribute('aria-current', 'page')
  })

  it('always links to the profile, marked current there', () => {
    const { rerender } = render(<Header route={null} />)
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '#/profile')
    rerender(<Header route={{ page: 'profile' }} />)
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page')
  })

  it('renders the add-files and account controls it is given', () => {
    render(
      <Header
        route={null}
        addFiles={<button type="button">Add files</button>}
        account={<button type="button">Sign in</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Add files' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('reads in order: the brand, then the actions, then the section tabs', () => {
    render(
      <Header
        route={{ page: 'run' }}
        addFiles={<button type="button">Add files</button>}
        account={<button type="button">Sign in</button>}
      />,
    )
    const brand = screen.getByRole('link', { name: 'RunningCyclingAnalysis' })
    const addFiles = screen.getByRole('button', { name: 'Add files' })
    const profile = screen.getByRole('link', { name: 'Profile' })
    const tabs = screen.getByRole('navigation', { name: 'Sections' })
    expect(follows(brand, addFiles)).toBe(true)
    expect(follows(addFiles, profile)).toBe(true)
    expect(follows(profile, tabs)).toBe(true)
  })
})
