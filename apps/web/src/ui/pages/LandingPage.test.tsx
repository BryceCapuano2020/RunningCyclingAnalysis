// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analysisStub } from '../../test/analysisStub'
import { noMatchMedia } from '../../test/viewport'
import { TOUCH_QUERY } from '../useMediaQuery'
import { HISTORY_ADVICE } from '../exportGuides'
import { LandingPage } from './LandingPage'

afterEach(() => {
  cleanup()
  noMatchMedia()
})

/** The example result's figure, found by its caption. */
function exampleFigure(): HTMLElement {
  const figure = screen
    .getByText('Illustrative: the sample athlete, a 37-year-old man at 75 kg')
    .closest('figure')
  if (!figure) throw new Error('No example figure')
  return figure
}

/** A touch screen: the touch query matches, and no other does. */
function touchScreen() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === TOUCH_QUERY,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  })
}

describe('LandingPage on a touch screen', () => {
  it('puts the two actions directly under the pitch, ahead of the example, the sample first', () => {
    touchScreen()
    const { container } = render(
      <LandingPage analysis={analysisStub()} signedIn={false} units="metric" onFiles={vi.fn()} />,
    )
    const start = container.querySelector('.landing__start')
    expect(start).toHaveClass('landing__start--touch')
    const [first, second] = Array.from(start?.children ?? [])
    expect(first).toHaveClass('dropzone--touch')
    expect(second).toHaveClass('landing-example')
    const pitch = container.querySelector('.app__pitch')!
    expect(pitch.compareDocumentPosition(first!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const buttons = within(first as HTMLElement).getAllByRole('button')
    expect(buttons.slice(0, 2).map((button) => button.textContent)).toEqual([
      'See a sample athlete',
      'Add files',
    ])
    expect(buttons[0]).toHaveClass('btn-primary')
    expect(buttons[1]).not.toHaveClass('btn-primary')
  })

  it('offers only Add files, as the primary action, to a signed-in visitor', () => {
    touchScreen()
    const { container } = render(
      <LandingPage analysis={analysisStub()} signedIn units="metric" onFiles={vi.fn()} />,
    )
    const zone = container.querySelector('.dropzone--touch') as HTMLElement
    expect(within(zone).getByRole('button', { name: 'Add files' })).toHaveClass('btn-primary')
    expect(within(zone).queryByRole('button', { name: 'See a sample athlete' })).toBeNull()
  })
})

describe('LandingPage', () => {
  it('asks which sport the visitor is better at, as the focusable page heading', () => {
    render(
      <LandingPage analysis={analysisStub()} signedIn={false} units="metric" onFiles={vi.fn()} />,
    )

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Are you a better runner or a better cyclist?',
    })
    expect(heading).toHaveAttribute('id', 'page-heading')
    expect(heading).toHaveAttribute('tabindex', '-1')
  })

  it('says what to bring and what comes back in one sentence, ending on the privacy promise', () => {
    render(
      <LandingPage analysis={analysisStub()} signedIn={false} units="metric" onFiles={vi.fn()} />,
    )
    expect(
      screen.getByText(
        'Drop in your Strava export or watch files to see your level in each sport for your age, with honest ranges. Nothing leaves your device.',
      ),
    ).toBeInTheDocument()
  })

  it('does not promise that nothing leaves the device to a signed-in visitor, whose summaries are stored', () => {
    render(<LandingPage analysis={analysisStub()} signedIn units="metric" onFiles={vi.fn()} />)
    expect(screen.queryByText(/Nothing leaves your device/)).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'Drop in your Strava export or watch files to see your level in each sport for your age, with honest ranges. Your files are analysed on your device.',
      ),
    ).toBeInTheDocument()
  })

  it('puts the example before the drop zone on a pointer, where they sit side by side', () => {
    const { container } = render(
      <LandingPage analysis={analysisStub()} signedIn={false} units="metric" onFiles={vi.fn()} />,
    )
    const [first, second] = Array.from(container.querySelector('.landing__start')?.children ?? [])
    expect(first).toHaveClass('landing-example')
    expect(second).toHaveClass('dropzone')
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

  it('shows the example result as Balance’s level scale: the lean, each sport’s level and best 20 minutes', () => {
    render(
      <LandingPage analysis={analysisStub()} signedIn={false} units="metric" onFiles={vi.fn()} />,
    )

    const example = exampleFigure()
    expect(within(example).getByText('Your balance leans toward running')).toBeInTheDocument()
    expect(within(example).getByText('11 pts')).toBeInTheDocument()
    expect(within(example).getByText(/^Local · 3:56 \/km on your best 20 min$/)).toBeInTheDocument()
    expect(within(example).getByText(/^Recreational to Local · 243 W/)).toBeInTheDocument()
    expect(within(example).queryByText(/W\/kg/)).not.toBeInTheDocument()
    // The drawing is named for a screen reader, and its marks are the sports': a dot, and a ring over a band.
    expect(
      within(example).getByRole('img', { name: /^Age-grade level of your best 20 min\./ }),
    ).toBeInTheDocument()
    expect(example.querySelector('.balance-scale__dot')).not.toBeNull()
    expect(example.querySelector('.balance-scale__ring')).not.toBeNull()
  })

  it('gives the example pace per mile for imperial', () => {
    render(
      <LandingPage analysis={analysisStub()} signedIn={false} units="imperial" onFiles={vi.fn()} />,
    )
    expect(
      within(exampleFigure()).getByText(/^Local · 6:19 \/mi on your best 20 min$/),
    ).toBeInTheDocument()
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
