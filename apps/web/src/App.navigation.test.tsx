// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { makeActivity, makeResult } from './ui/components/fixtures'
import { app, resetAppMocks, setSession, showResult } from './test/appMocks'
import { browserHashChange, recordHashListeners } from './test/hashchange'

vi.mock('./ui/useAccount', async () => ({
  useAccount: (await import('./test/appMocks')).useAccountMock,
}))
vi.mock('./ui/useAnalysis', async () => ({
  useAnalysis: (await import('./test/appMocks')).useAnalysisMock,
}))
vi.mock('./ui/useSettings', async () => ({
  usePreferences: (await import('./test/appMocks')).usePreferencesMock,
}))
vi.mock('./ui/charts', async () => {
  const { heavyChartStubs } = await import('./test/appMocks')
  const { TrendChart } = await import('./ui/charts/TrendChart')
  return { ...heavyChartStubs, TrendChart }
})

const APP = 'RunningCyclingAnalysis'
const COLD = 'Add your files to see this page.'

/** The line above the page that says why a link shows the landing page, or null while there is none. */
function noticeOf(): HTMLElement | null {
  const notice = document.querySelector('.app__notice')
  return notice instanceof HTMLElement ? notice : null
}

beforeEach(() => {
  resetAppMocks()
})

describe('document title', () => {
  it('names the page on screen, so tabs and history tell pages apart', () => {
    showResult()
    window.location.hash = '#/run'
    render(<App />)
    expect(document.title).toBe(`Run · ${APP}`)
  })

  it('is the app name alone on the landing page', () => {
    render(<App />)
    expect(document.title).toBe(APP)
  })

  it('names an activity outside the period by its own name, from the whole library', () => {
    const result = makeResult()
    const outside = makeActivity({ id: 'old-ride', name: 'Hill Repeats', sport: 'ride' })
    setSession({ result, library: [...result.activities, outside] })
    window.location.hash = '#/activities/old-ride'
    render(<App />)
    expect(document.title).toBe(`Hill Repeats · ${APP}`)
  })
})

describe('skip link', () => {
  it('is the first control on the page, ahead of the header', () => {
    showResult()
    render(<App />)
    const page = document.querySelector('.page')
    expect(page?.firstElementChild).toBe(screen.getByRole('button', { name: 'Skip to content' }))
  })
})

describe('footer', () => {
  it('links to How sure is this? beside the privacy link', () => {
    render(<App />)
    const footer = document.querySelector('.app__footer')
    if (!(footer instanceof HTMLElement)) throw new Error('No footer')
    expect(within(footer).getByRole('link', { name: 'How sure is this?' })).toHaveAttribute(
      'href',
      '#/method',
    )
  })
})

describe('scroll when Back returns to a page', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 })
  })

  it('restores the scroll first, then moves focus to the heading without scrolling again', () => {
    showResult()
    window.location.hash = '#/run'
    const log: string[] = []
    vi.spyOn(window, 'scrollTo').mockImplementation((_x, y) => {
      log.push(`scroll:${String(y)}`)
    })
    const originalFocus = HTMLElement.prototype.focus
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
      this: HTMLElement,
      options?: FocusOptions,
    ) {
      if (this.id === 'page-heading') {
        log.push(`focus:${options?.preventScroll === true ? 'no-scroll' : 'scroll'}`)
      }
      originalFocus.call(this, options)
    })

    const view = render(<App />)
    const runEntry = window.history.state
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 500 })
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })

    act(() => {
      const oldURL = window.location.href
      window.history.pushState(null, '', '#/activities')
      window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL }))
    })
    view.rerender(<App />)
    log.length = 0

    act(() => {
      const oldURL = window.location.href
      window.history.replaceState(runEntry, '', '#/run')
      window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL }))
    })
    view.rerender(<App />)

    expect(log).toEqual(['scroll:500', 'focus:no-scroll'])
  })
})

describe('scroll when the first result replaces the landing page', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 0 })
  })

  it('starts at the top, not where the landing page was scrolled, then focuses the heading', () => {
    window.location.hash = '#/'
    const log: string[] = []
    vi.spyOn(window, 'scrollTo').mockImplementation((_x, y) => {
      log.push(`scroll:${String(y)}`)
    })
    const originalFocus = HTMLElement.prototype.focus
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
      this: HTMLElement,
      options?: FocusOptions,
    ) {
      if (this.id === 'page-heading') {
        log.push(`focus:${options?.preventScroll === true ? 'no-scroll' : 'scroll'}`)
      }
      originalFocus.call(this, options)
    })

    // The sample button sits below the fold on a phone; the visitor scrolls down to it and taps it.
    const view = render(<App />)
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: 400 })
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    log.length = 0

    showResult()
    view.rerender(<App />)

    expect(log).toEqual(['scroll:0', 'focus:no-scroll'])
  })
})

describe('deep links without a result', () => {
  it('say what the page needs, and keep the address the visitor followed', () => {
    window.location.hash = '#/activities/abc'
    render(<App />)
    expect(noticeOf()).toHaveTextContent(COLD)
    expect(window.location.hash).toBe('#/activities/abc')
  })

  it('show no notice on Balance, which is the landing page', () => {
    window.location.hash = '#/'
    render(<App />)
    expect(noticeOf()).toBeNull()
  })

  it('replace an unknown hash with Balance, so the address names the page shown', async () => {
    window.location.hash = '#/nowhere'
    render(<App />)
    await waitFor(() => expect(window.location.hash).toBe('#/'))
  })

  it('keeps a deep link through a signed-in library load, which holds the page busy but is not an import', () => {
    window.location.hash = '#/run'
    app.analysis.busy = true
    app.analysis.libraryStatus = 'loading'
    const view = render(<App />)

    app.analysis.busy = false
    app.analysis.libraryStatus = 'loaded'
    showResult()
    view.rerender(<App />)

    expect(window.location.hash).toBe('#/run')
  })

  it('moves a visitor who imports from the deep link to Balance, the home page', async () => {
    window.location.hash = '#/run'
    const view = render(<App />)
    expect(window.location.hash).toBe('#/run')

    app.analysis.busy = true
    view.rerender(<App />)
    app.analysis.busy = false
    showResult()
    view.rerender(<App />)

    await waitFor(() => expect(window.location.hash).toBe('#/'))
  })
})

describe('Back to Balance from the method page', () => {
  it('is reachable from How sure is this?', async () => {
    showResult()
    window.location.hash = '#/method'
    render(<App />)
    await userEvent.click(screen.getByRole('link', { name: 'Back to Balance' }))
    await waitFor(() => expect(window.location.hash).toBe('#/'))
  })
})

describe('an activity opened from a sport', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keeps the Run tab lit and reads Back to Run when a record link opens the activity', async () => {
    showResult()
    window.history.replaceState(null, '', '#/run')
    const listeners = recordHashListeners()
    render(<App />)

    const oldURL = window.location.href
    window.history.pushState(null, '', '#/activities/run-1')
    await browserHashChange(listeners, oldURL)

    expect(screen.getByRole('link', { name: 'Run' })).toHaveClass('header__tab--current')
    expect(screen.getByRole('link', { name: 'Back to Run' })).toHaveAttribute('href', '#/run')
  })
})
