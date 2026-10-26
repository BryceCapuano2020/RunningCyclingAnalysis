// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analysisStub } from '../../test/analysisStub'
import { HISTORY_ADVICE } from '../exportGuides'
import { LandingPage } from './LandingPage'

afterEach(() => {
  cleanup()
})

/** The example result's figure, found by its caption. */
function exampleFigure(): HTMLElement {
  const figure = screen.getByText('Illustrative: the sample athlete').closest('figure')
  if (!figure) throw new Error('No example figure')
  return figure
}

describe('LandingPage', () => {
  it('asks how balanced the visitor is, as the focusable page heading', () => {
    render(
      <LandingPage analysis={analysisStub()} signedIn={false} units="metric" onFiles={vi.fn()} />,
    )

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'How balanced are you as an athlete?',
    })
    expect(heading).toHaveAttribute('id', 'page-heading')
    expect(heading).toHaveAttribute('tabindex', '-1')
  })

  it('names running and cycling plainly in the lede, and what the visitor gets back', () => {
    render(
      <LandingPage analysis={analysisStub()} signedIn={false} units="metric" onFiles={vi.fn()} />,
    )
    expect(
      screen.getByText(
        'Add your runs and rides. See how your running and cycling compare, as your level for your age, and which way your balance leans.',
      ),
    ).toBeInTheDocument()
  })

  it('offers the sample athlete to a signed-out visitor and loads it on click', () => {
    const loadSample = vi.fn()
    render(
      <LandingPage
        analysis={analysisStub({ loadSample })}
        signedIn={false}
        units="metric"
        onFiles={vi.fn()}
      />,
    )

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
        onFiles={vi.fn()}
      />,
    )

    const sample = screen.getByRole('button', { name: 'See a sample athlete' })
    expect(sample).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(sample)
    expect(loadSample).not.toHaveBeenCalled()
  })

  it('leaves the sample out for a signed-in user', () => {
    render(<LandingPage analysis={analysisStub()} signedIn units="metric" onFiles={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'See a sample athlete' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Try the sample while you wait' }),
    ).not.toBeInTheDocument()
  })

  it('offers the sample inside the Strava guide, right after its wait step', () => {
    const loadSample = vi.fn()
    render(
      <LandingPage
        analysis={analysisStub({ loadSample })}
        signedIn={false}
        units="metric"
        onFiles={vi.fn()}
      />,
    )
    const strava = screen.getByRole('region', { name: 'Steps for Strava' })
    const waitStep = within(strava).getAllByRole('listitem')[3]
    if (!waitStep) throw new Error('No wait step')
    fireEvent.click(within(waitStep).getByRole('button', { name: 'Try the sample while you wait' }))
    expect(loadSample).toHaveBeenCalledOnce()
  })

  it('lists the three steps in order, each with its explanation', () => {
    const { container } = render(
      <LandingPage analysis={analysisStub()} signedIn={false} units="metric" onFiles={vi.fn()} />,
    )

    const list = container.querySelector('.app__steps')
    if (!list) throw new Error('No steps list')
    const steps = within(list as HTMLElement).getAllByRole('listitem')
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
      screen.getByText(
        'Export from Garmin, Wahoo, COROS or Zwift, or download the zip from Strava’s account export.',
      ),
    ).toBeInTheDocument()
  })

  it('says in step 2 what the app asks for, and why each answer is needed', () => {
    const { container } = render(
      <LandingPage analysis={analysisStub()} signedIn={false} units="metric" onFiles={vi.fn()} />,
    )
    const list = container.querySelector('.app__steps')
    if (!list) throw new Error('No steps list')
    const [, second] = within(list as HTMLElement).getAllByRole('listitem')
    expect(
      within(second!).getByText(
        'The app asks for your age, sex and weight. Your age and sex set the standard for each sport, and a ride needs your weight to show its level.',
      ),
    ).toBeInTheDocument()
  })

  it('says how much history to bring once, in the drop zone, and not again in step 1', () => {
    const { container } = render(
      <LandingPage analysis={analysisStub()} signedIn={false} units="metric" onFiles={vi.fn()} />,
    )
    const list = container.querySelector('.app__steps')
    if (!list) throw new Error('No steps list')
    const [first] = within(list as HTMLElement).getAllByRole('listitem')
    expect(within(first!).queryByText(HISTORY_ADVICE)).not.toBeInTheDocument()
    expect(within(first!).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getAllByText(HISTORY_ADVICE)).toHaveLength(1)
  })

  it('moves focus to the export guides from the drop zone, without changing the hash route', () => {
    render(
      <LandingPage analysis={analysisStub()} signedIn={false} units="metric" onFiles={vi.fn()} />,
    )
    const hash = window.location.hash
    fireEvent.click(screen.getByRole('button', { name: 'No files yet? How to get them' }))
    expect(screen.getByRole('heading', { level: 2, name: 'How to get your files' })).toHaveFocus()
    expect(window.location.hash).toBe(hash)
  })

  it('offers how to get the files after the steps, in a section of its own', () => {
    render(
      <LandingPage analysis={analysisStub()} signedIn={false} units="metric" onFiles={vi.fn()} />,
    )
    expect(screen.getByRole('region', { name: 'How to get your files' })).toBeInTheDocument()
  })

  it('shows the example result with its meter and the example pace and power', () => {
    render(
      <LandingPage analysis={analysisStub()} signedIn={false} units="metric" onFiles={vi.fn()} />,
    )

    const example = exampleFigure()
    expect(within(example).getByText('Your balance leans toward running')).toBeInTheDocument()
    expect(
      within(example).getByRole('img', {
        name: 'Running grades 6 points higher than cycling (range 1 to 12\u00a0points)',
      }),
    ).toBeInTheDocument()
    expect(within(example).getByText('Running · Local · 64%')).toBeInTheDocument()
    expect(within(example).getByText('Pace 4:29 /km')).toBeInTheDocument()
    expect(within(example).getByText('Power 225 W')).toBeInTheDocument()
    expect(within(example).queryByText(/W\/kg/)).not.toBeInTheDocument()
  })

  it('puts running on the left end of the example meter, as the sport cards do', () => {
    render(
      <LandingPage analysis={analysisStub()} signedIn={false} units="metric" onFiles={vi.fn()} />,
    )
    const leftEnd = exampleFigure().querySelector('.balance-meter__end--left')
    const rightEnd = exampleFigure().querySelector('.balance-meter__end--right')
    expect(leftEnd).toHaveAttribute('data-sport', 'run')
    expect(rightEnd).toHaveAttribute('data-sport', 'ride')
  })

  it('gives the example pace per mile for imperial', () => {
    render(
      <LandingPage analysis={analysisStub()} signedIn={false} units="imperial" onFiles={vi.fn()} />,
    )
    // The sample's own Balance reads the same pace.
    expect(within(exampleFigure()).getByText('Pace 7:12 /mi')).toBeInTheDocument()
  })

  it('explains the result in three plain sentences, with a link to the full method', () => {
    const { container } = render(
      <LandingPage analysis={analysisStub()} signedIn={false} units="metric" onFiles={vi.fn()} />,
    )
    const section = container.querySelector('.landing__method')
    if (!section) throw new Error('No method section')
    expect(section.querySelectorAll('p')).toHaveLength(3)
    expect(
      within(section as HTMLElement).getByRole('link', { name: 'Full method' }),
    ).toHaveAttribute('href', '#/method')
  })

  it('says how the result is worked out in plain words, without the jargon', () => {
    const { container } = render(
      <LandingPage analysis={analysisStub()} signedIn={false} units="metric" onFiles={vi.fn()} />,
    )
    const section = container.querySelector('.landing__method')
    if (!section) throw new Error('No method section')
    expect(section.textContent).toContain('If the two could be level, it says they are in balance')
    expect(section.textContent).toContain('judged on your best 20 min: running')
    expect(section.textContent).not.toMatch(/grade|graded|grade-adjusted/i)
  })

  it('no longer opens the full methodology accordion on the landing page', () => {
    render(
      <LandingPage analysis={analysisStub()} signedIn={false} units="metric" onFiles={vi.fn()} />,
    )
    expect(
      screen.queryByRole('heading', { name: 'How this works and what it assumes' }),
    ).not.toBeInTheDocument()
  })
})
