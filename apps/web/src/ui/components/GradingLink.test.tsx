// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { StrictMode, useEffect } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MethodPage } from '../pages/MethodPage'
import { focusPageHeading } from '../pages/pageHeading'
import { makeResult } from './fixtures'
import { GradingLink } from './GradingLink'
import {
  clearRequestedMethodSection,
  requestMethodSection,
  requestedMethodSection,
} from './methodSection'
import { SECTION_ID } from './methodTopics'

afterEach(() => {
  cleanup()
  clearRequestedMethodSection()
})

/** Moves the hash, and resolves when the browser reports the change, as it does for a link. */
function navigateTo(hash: string): Promise<void> {
  const changed = new Promise<void>((resolve) =>
    window.addEventListener('hashchange', () => resolve(), { once: true }),
  )
  window.location.hash = hash
  return changed
}

/** Lets the page's pending timers run, as they do before the next paint. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10))
}

function methodPage() {
  return <MethodPage result={makeResult()} units="metric" profile={null} weightKnown />
}

function gradesHeading(): HTMLElement {
  return screen.getByRole('heading', { level: 2, name: 'Age grades and levels' })
}

/** Stands in for App's page effect, which moves focus to the page heading when a page mounts. */
function PageMount({ children }: { children: ReactNode }) {
  useEffect(() => {
    focusPageHeading()
  }, [])
  return <>{children}</>
}

describe('GradingLink', () => {
  it('links to How sure is this?', () => {
    render(<GradingLink />)

    expect(screen.getByRole('link', { name: 'How is this graded?' })).toHaveAttribute(
      'href',
      '#/method',
    )
  })

  it.each([
    ['a ctrl-click, which opens a new tab', { ctrlKey: true }],
    ['a meta-click, which opens a new tab', { metaKey: true }],
    ['a shift-click, which opens a new window', { shiftKey: true }],
    ['an alt-click, which downloads the link', { altKey: true }],
    ['a middle-button click', { button: 1 }],
  ])('leaves nothing armed for %s', (_name, init) => {
    render(<GradingLink />)

    fireEvent.click(screen.getByRole('link', { name: 'How is this graded?' }), init)

    expect(requestedMethodSection()).toBeNull()
  })

  it('asks the Method page to focus its grading heading, and that page focuses it when it mounts', async () => {
    render(<GradingLink />)

    fireEvent.click(screen.getByRole('link', { name: 'How is this graded?' }))
    expect(requestedMethodSection()).toBe(SECTION_ID.grades)

    cleanup()
    render(methodPage())
    await waitFor(() => expect(document.activeElement).toBe(gradesHeading()))
    expect(requestedMethodSection()).toBeNull()
  })

  it('keeps the grading heading focused when the app focuses the page heading on the same mount', async () => {
    requestMethodSection(SECTION_ID.grades)
    render(<PageMount>{methodPage()}</PageMount>)

    await waitFor(() => expect(document.activeElement).toBe(gradesHeading()))
    await settle()
    expect(document.activeElement).toBe(gradesHeading())
  })

  it('still focuses the grading heading under StrictMode, which runs each effect twice', async () => {
    requestMethodSection(SECTION_ID.grades)
    render(<StrictMode>{methodPage()}</StrictMode>)

    await waitFor(() => expect(document.activeElement).toBe(gradesHeading()))
  })

  it('drops a request whose page unmounts before it can focus, so a later mount does not jump', async () => {
    requestMethodSection(SECTION_ID.grades)
    const { unmount } = render(methodPage())
    unmount()
    await settle()
    expect(requestedMethodSection()).toBeNull()

    render(methodPage())
    await settle()
    expect(document.activeElement).not.toBe(gradesHeading())
  })

  it('drops a request whose link was followed with no result, so a later visit does not jump', async () => {
    await navigateTo('#/')
    render(<GradingLink />)
    fireEvent.click(screen.getByRole('link', { name: 'How is this graded?' }))

    // The link's own navigation arrives, but no result is loaded, so no Method page mounts.
    await navigateTo('#/method')
    expect(requestedMethodSection()).toBe(SECTION_ID.grades)
    cleanup()

    // A later visit to How sure is this? from another page is a route change of its own.
    await navigateTo('#/')
    await navigateTo('#/method')
    expect(requestedMethodSection()).toBeNull()

    render(methodPage())
    await settle()
    expect(document.activeElement).not.toBe(gradesHeading())
  })
})
