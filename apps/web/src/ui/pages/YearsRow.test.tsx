// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { yearsWords } from '../yearsRow'
import { YEARS_LOOKBACK } from '../yearsFixtures'
import { NO_FITNESS } from '@rca/core/fitness/types'
import type { YearsRowProps } from './YearsRow'

const IMPRESSION_MS = 3_000

/** The row of a page load that has not counted a showing yet: the count is the module's, one for each page load. */
async function freshRow() {
  vi.resetModules()
  const { YearsRow } = await import('./YearsRow')
  return (props: YearsRowProps) => <YearsRow {...props} />
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const words = () => yearsWords(YEARS_LOOKBACK, NO_FITNESS, 'metric')!

describe('the "Your years" row', () => {
  it('is a region named "Your years" with the lead as its line and no heading in the outline', async () => {
    const Row = await freshRow()
    render(<Row words={words()} onSeen={vi.fn()} />)
    const region = screen.getByRole('region', { name: 'Your years' })
    expect(region).toHaveTextContent(/From May 2021 your pace at 148 bpm was about 8\.7%/)
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('names the disclosure for a screen reader, and opens to the whole sentence', async () => {
    const Row = await freshRow()
    const onSeen = vi.fn()
    render(<Row words={words()} onSeen={onSeen} />)
    expect(screen.getByText('Show your years.', { exact: false })).toHaveClass('sr-only')
    const details = document.querySelector('details')!
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(onSeen).toHaveBeenCalledWith('open')
    expect(screen.getByTestId('years-row')).toHaveTextContent(/By January 2022 it was back/)
  })

  it('moves focus to the page heading when it hides, and stays hidden when the page comes back', async () => {
    const Row = await freshRow()
    render(
      <>
        <h1 id="page-heading" tabIndex={-1}>
          Balance
        </h1>
        <Row words={words()} onSeen={vi.fn()} />
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    cleanup()
    // Away to another page and back, with nothing stored to remember it: still hidden.
    render(<Row words={words()} onSeen={vi.fn()} />)
    expect(screen.queryByTestId('years-row')).toBeNull()
  })

  it('hides on request, and says so once', async () => {
    const Row = await freshRow()
    const onSeen = vi.fn()
    render(<Row words={words()} onSeen={onSeen} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(onSeen).toHaveBeenCalledTimes(1)
    expect(onSeen).toHaveBeenCalledWith('hide')
    expect(screen.queryByTestId('years-row')).toBeNull()
  })

  it('counts one impression after three seconds, once a page load, apart from the check-in row', async () => {
    const Row = await freshRow()
    const onSeen = vi.fn()
    const first = render(<Row words={words()} onSeen={onSeen} />)
    act(() => void vi.advanceTimersByTime(IMPRESSION_MS - 1))
    expect(onSeen).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(1))
    expect(onSeen).toHaveBeenCalledWith('impression')
    first.unmount()
    render(<Row words={words()} onSeen={onSeen} />)
    act(() => void vi.advanceTimersByTime(IMPRESSION_MS * 2))
    expect(onSeen).toHaveBeenCalledTimes(1)
  })
})
