// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analysisStub } from '../../test/analysisStub'
import { LandingPage } from './LandingPage'

afterEach(() => {
  cleanup()
})

/** The example result's figure, found by its caption. */
function exampleFigure(): HTMLElement {
  const figure = screen.getByText('Example result').closest('figure')
  if (!figure) throw new Error('No example figure')
  return figure
}

describe('LandingPage', () => {
  it('asks how balanced the visitor is, as the focusable page heading', () => {
    render(<LandingPage analysis={analysisStub()} signedIn={false} units="metric" />)

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'How balanced are you as an athlete?',
    })
    expect(heading).toHaveAttribute('id', 'page-heading')
    expect(heading).toHaveAttribute('tabindex', '-1')
  })

  it('says what the app gives back for the files', () => {
    render(<LandingPage analysis={analysisStub()} signedIn={false} units="metric" />)
    expect(
      screen.getByText(
        'Add your run and ride files to see your running and cycling side by side, how your balance leans, and what your bike fitness is worth on foot.',
      ),
    ).toBeInTheDocument()
  })

  it('offers the sample athlete to a signed-out visitor and loads it on click', () => {
    const loadSample = vi.fn()
    render(<LandingPage analysis={analysisStub({ loadSample })} signedIn={false} units="metric" />)

    fireEvent.click(screen.getByRole('button', { name: 'See a sample athlete' }))

    expect(loadSample).toHaveBeenCalledOnce()
  })

  it('holds the sample while an analysis is busy, and ignores a click on it', () => {
    const loadSample = vi.fn()
    render(
      <LandingPage
        analysis={analysisStub({ busy: true, loadSample })}
        signedIn={false}
        units="metric"
      />,
    )

    const sample = screen.getByRole('button', { name: 'See a sample athlete' })
    expect(sample).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(sample)
    expect(loadSample).not.toHaveBeenCalled()
  })

  it('leaves the sample out for a signed-in user', () => {
    render(<LandingPage analysis={analysisStub()} signedIn units="metric" />)
    expect(screen.queryByRole('button', { name: 'See a sample athlete' })).not.toBeInTheDocument()
  })

  it('lists the three steps in order, each with its explanation', () => {
    render(<LandingPage analysis={analysisStub()} signedIn={false} units="metric" />)

    const steps = screen.getAllByRole('listitem')
    expect(steps).toHaveLength(3)
    expect(
      within(steps[0]!).getByRole('heading', { level: 2, name: '1. Add your files' }),
    ).toBeInTheDocument()
    expect(
      within(steps[1]!).getByRole('heading', { level: 2, name: '2. Both sports on one scale' }),
    ).toBeInTheDocument()
    expect(
      within(steps[2]!).getByRole('heading', { level: 2, name: '3. See your balance' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/FIT, GPX or TCX files from Garmin, Wahoo, Coros or Zwift/),
    ).toBeInTheDocument()
  })

  it('shows the example result with its meter and the example pace and power', () => {
    render(<LandingPage analysis={analysisStub()} signedIn={false} units="metric" />)

    const example = exampleFigure()
    expect(within(example).getByText('Your balance leans toward running')).toBeInTheDocument()
    expect(
      within(example).getByRole('img', { name: 'Running ahead by 12% (range 4% to 20%)' }),
    ).toBeInTheDocument()
    expect(within(example).getByText('4:08 /km')).toBeInTheDocument()
    expect(within(example).getByText('225 W')).toBeInTheDocument()
    expect(within(example).getByText('3.0 W/kg')).toBeInTheDocument()
  })

  it('gives the example pace per mile for imperial', () => {
    render(<LandingPage analysis={analysisStub()} signedIn={false} units="imperial" />)
    expect(within(exampleFigure()).getByText('6:39 /mi')).toBeInTheDocument()
  })

  it('explains how the result is worked out, with the methodology closed under it', () => {
    render(<LandingPage analysis={analysisStub()} signedIn={false} units="metric" />)
    expect(
      screen.getByRole('heading', { level: 2, name: 'How this works and what it assumes' }),
    ).toBeInTheDocument()
  })
})
