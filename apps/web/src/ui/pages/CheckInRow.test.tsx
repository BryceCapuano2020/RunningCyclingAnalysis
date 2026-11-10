// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../test/deviceZone'
import { BUSY_CHECK_IN, QUIET_CHECK_IN } from '../test/checkInFixtures'
import { checkInWords } from '../checkInRow'
import type { CheckInRowProps } from './CheckInRow'

const IMPRESSION_MS = 3_000

/** The row of a page load that has not counted a showing yet: the count is the module's, one for each page load. */
async function freshRow() {
  vi.resetModules()
  const { CheckInRow } = await import('./CheckInRow')
  return (props: CheckInRowProps) => <CheckInRow {...props} />
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const words = (busy = false) =>
  checkInWords({ checkIn: busy ? BUSY_CHECK_IN : QUIET_CHECK_IN, seen: false }, 'metric')!

describe('the check-in row', () => {
  it('is a region named "Since your last import", with no heading in the outline', async () => {
    const Row = await freshRow()
    render(<Row words={words()} onSeen={vi.fn()} />)
    const { headline } = words()
    const region = screen.getByRole('region', { name: 'Since your last import' })
    expect(region).toHaveTextContent(headline.label)
    expect(region).toHaveTextContent(headline.value)
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('says what else the import told behind a disclosure, and counts opening it as seen', async () => {
    const Row = await freshRow()
    const onSeen = vi.fn()
    render(<Row words={words(true)} onSeen={onSeen} />)
    const details = document.querySelector('details')!
    expect(details.open).toBe(false)
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(onSeen).toHaveBeenCalledWith('open')
    const best = words(true).rows.find((row) => row.label.startsWith('New best'))!
    const item = screen.getByText(best.label).closest('div')!
    expect(item).toHaveTextContent(best.value)
    expect(item).toHaveTextContent(best.detail!)
  })

  it('hides on request, and says so once', async () => {
    const Row = await freshRow()
    const onSeen = vi.fn()
    render(<Row words={words()} onSeen={onSeen} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(onSeen).toHaveBeenCalledTimes(1)
    expect(onSeen).toHaveBeenCalledWith('hide')
    expect(screen.queryByTestId('checkin-row')).toBeNull()
  })

  it('counts one impression after three seconds on a visible page, and not before', async () => {
    const Row = await freshRow()
    const onSeen = vi.fn()
    render(<Row words={words()} onSeen={onSeen} />)
    act(() => void vi.advanceTimersByTime(IMPRESSION_MS - 1))
    expect(onSeen).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(1))
    expect(onSeen).toHaveBeenCalledWith('impression')
    act(() => void vi.advanceTimersByTime(IMPRESSION_MS * 3))
    expect(onSeen).toHaveBeenCalledTimes(1)
  })

  it('counts a page load once, however many times the row is shown in it', async () => {
    const Row = await freshRow()
    const onSeen = vi.fn()
    const first = render(<Row words={words()} onSeen={onSeen} />)
    act(() => void vi.advanceTimersByTime(IMPRESSION_MS))
    first.unmount()
    // Away to another page and back: the same page load.
    render(<Row words={words()} onSeen={onSeen} />)
    act(() => void vi.advanceTimersByTime(IMPRESSION_MS * 2))
    expect(onSeen).toHaveBeenCalledTimes(1)
  })

  it('counts nothing while the page is hidden, and starts when it is shown again', async () => {
    const Row = await freshRow()
    const onSeen = vi.fn()
    let state: DocumentVisibilityState = 'hidden'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => state)
    render(<Row words={words()} onSeen={onSeen} />)
    act(() => void vi.advanceTimersByTime(IMPRESSION_MS * 2))
    expect(onSeen).not.toHaveBeenCalled()
    state = 'visible'
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    act(() => void vi.advanceTimersByTime(IMPRESSION_MS))
    expect(onSeen).toHaveBeenCalledWith('impression')
  })

  it('waits for the row to be in view when the browser can say so', async () => {
    let notify: (entries: Partial<IntersectionObserverEntry>[]) => void = () => undefined
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          notify = (entries) => callback(entries as IntersectionObserverEntry[], this as never)
        }
        observe() {}
        disconnect() {}
      },
    )
    const Row = await freshRow()
    const onSeen = vi.fn()
    render(<Row words={words()} onSeen={onSeen} />)
    act(() => void vi.advanceTimersByTime(IMPRESSION_MS * 2))
    expect(onSeen).not.toHaveBeenCalled()
    act(() => notify([{ isIntersecting: true }]))
    act(() => void vi.advanceTimersByTime(IMPRESSION_MS))
    expect(onSeen).toHaveBeenCalledWith('impression')
  })
})
