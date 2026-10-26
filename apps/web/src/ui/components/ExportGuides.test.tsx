// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXPORT_GUIDES, GUIDES_CHECKED_ON } from '../exportGuides'
import { ExportGuides } from './ExportGuides'

afterEach(() => {
  cleanup()
})

const SERVICES = ['Strava', 'Garmin Connect', 'Wahoo', 'COROS', 'Zwift']
const WAIT_BUTTON = 'Try the sample while you wait'

/** The tile that picks one service's guide, found by its name. */
function tile(service: string): HTMLElement {
  return screen.getByRole('button', { name: service })
}

/** The one panel the tiles open, named by its heading, such as "Steps for Strava". */
function panel(service: string): HTMLElement {
  return screen.getByRole('region', { name: `Steps for ${service}` })
}

function pick(service: string) {
  fireEvent.click(tile(service))
}

/** The line that says where a guide's steps came from, and when they were checked. */
function sourceLine(item: (typeof EXPORT_GUIDES)[number]): string {
  const from = item.verified ? `${item.helpName}’s help` : 'published guides'
  return `Steps from ${from}, checked ${GUIDES_CHECKED_ON}; menus can change.`
}

function guide(service: string) {
  const found = EXPORT_GUIDES.find((item) => item.service === service)
  if (!found) throw new Error(`No guide for ${service}`)
  return found
}

describe('ExportGuides', () => {
  it('is a section headed "How to get your files"', () => {
    render(<ExportGuides />)
    expect(screen.getByRole('region', { name: 'How to get your files' })).toBeInTheDocument()
  })

  it('shows one tile per service, and opens Strava first', () => {
    render(<ExportGuides />)
    for (const service of SERVICES) expect(tile(service)).toBeInTheDocument()
    expect(tile('Strava')).toHaveAttribute('aria-expanded', 'true')
    expect(tile('Zwift')).toHaveAttribute('aria-expanded', 'false')
  })

  it('ties every tile to the one panel it opens', () => {
    render(<ExportGuides />)
    const id = panel('Strava').id
    expect(id).not.toBe('')
    for (const service of SERVICES) expect(tile(service)).toHaveAttribute('aria-controls', id)
  })

  it('moves focus into the panel when a tile opens it', () => {
    render(<ExportGuides />)
    pick('Zwift')
    expect(screen.getByRole('heading', { level: 3, name: 'Steps for Zwift' })).toHaveFocus()
  })

  it('does not move focus when the page first shows Strava', () => {
    render(<ExportGuides />)
    expect(screen.getByRole('heading', { level: 3, name: 'Steps for Strava' })).not.toHaveFocus()
  })

  it('shows the steps of the picked service only, as an ordered list in the data order', () => {
    render(<ExportGuides />)
    const strava = guide('Strava')
    const list = within(panel('Strava')).getByRole('list')
    expect(list.tagName).toBe('OL')
    const items = within(panel('Strava')).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(strava.steps)
  })

  it('switches the one panel to another service when its tile is picked', () => {
    render(<ExportGuides />)
    pick('Zwift')
    expect(tile('Zwift')).toHaveAttribute('aria-expanded', 'true')
    expect(tile('Strava')).toHaveAttribute('aria-expanded', 'false')
    expect(
      within(panel('Zwift'))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(guide('Zwift').steps)
  })

  it('says what each picked export contains, and its other route when it has one', () => {
    render(<ExportGuides />)
    for (const item of EXPORT_GUIDES) {
      pick(item.service)
      expect(within(panel(item.service)).getByText(item.contains)).toBeInTheDocument()
      if (item.alsoAvailable) {
        expect(within(panel(item.service)).getByText(item.alsoAvailable)).toBeInTheDocument()
      }
    }
  })

  it('ends every guide with the date its steps were checked and a link to its own help', () => {
    render(<ExportGuides />)
    for (const item of EXPORT_GUIDES) {
      pick(item.service)
      const region = panel(item.service)
      const link = within(region).getByRole('link', { name: `Open ${item.helpName}’s help` })
      expect(link).toHaveAttribute('href', item.helpUrl)
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(region.lastElementChild).toBe(link)
      expect(within(region).getByText(sourceLine(item))).toBeInTheDocument()
    }
  })

  it('shows no "not yet checked" note on any guide', () => {
    render(<ExportGuides />)
    for (const item of EXPORT_GUIDES) {
      pick(item.service)
      expect(screen.queryByText(/not yet checked/i)).not.toBeInTheDocument()
    }
  })

  it('gives Wahoo two steps, and sends the one-activity export to the Strava guide', () => {
    render(<ExportGuides />)
    pick('Wahoo')
    const items = within(panel('Wahoo')).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[1]).toHaveTextContent('Strava guide')
    expect(within(panel('Wahoo')).queryByText(/Export Original/)).not.toBeInTheDocument()
  })

  it('says a guide’s steps come from published guides unless Strava’s own help was read', () => {
    render(<ExportGuides />)
    pick('Strava')
    expect(
      within(panel('Strava')).getByText(
        `Steps from Strava’s help, checked ${GUIDES_CHECKED_ON}; menus can change.`,
      ),
    ).toBeInTheDocument()
    for (const service of ['Garmin Connect', 'Wahoo', 'COROS', 'Zwift']) {
      pick(service)
      expect(
        within(panel(service)).getByText(
          `Steps from published guides, checked ${GUIDES_CHECKED_ON}; menus can change.`,
        ),
      ).toBeInTheDocument()
    }
  })

  it('offers the sample inside the Strava guide, right after the wait step', () => {
    const onSample = vi.fn()
    render(<ExportGuides sample={{ busy: false, onSample }} />)
    const items = within(panel('Strava')).getAllByRole('listitem')
    const wait = items[3]
    expect(wait).toBeDefined()
    fireEvent.click(within(wait!).getByRole('button', { name: WAIT_BUTTON }))
    expect(onSample).toHaveBeenCalledOnce()
    expect(within(items[4]!).queryByRole('button')).not.toBeInTheDocument()
  })

  it('offers the sample only on the Strava wait step, not on other guides', () => {
    render(<ExportGuides sample={{ busy: false, onSample: vi.fn() }} />)
    pick('Zwift')
    expect(screen.queryByRole('button', { name: WAIT_BUTTON })).not.toBeInTheDocument()
  })

  it('has no sample button unless the page gives it one', () => {
    render(<ExportGuides />)
    expect(screen.queryByRole('button', { name: WAIT_BUTTON })).not.toBeInTheDocument()
  })

  it('holds the sample while an import is busy, and ignores its click', () => {
    const onSample = vi.fn()
    render(<ExportGuides sample={{ busy: true, onSample }} />)
    const sample = screen.getByRole('button', { name: WAIT_BUTTON })
    expect(sample).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(sample)
    expect(onSample).not.toHaveBeenCalled()
  })

  it('says what to do with no export yet, and on a phone, without a sample button of its own', () => {
    render(<ExportGuides sample={{ busy: false, onSample: vi.fn() }} />)
    const heading = screen.getByRole('heading', {
      level: 3,
      name: 'No files yet, or only a phone?',
    })
    const section = heading.parentElement
    if (!section) throw new Error('No section under the heading')
    expect(within(section).queryByRole('button')).not.toBeInTheDocument()
    expect(within(section).getByText(/Wahoo’s steps use its phone app\./)).toBeInTheDocument()
    expect(within(section).getByText(/written for a computer/)).toBeInTheDocument()
  })

  it('gives two instances on one page their own heading ids, so both can mount', () => {
    render(
      <>
        <ExportGuides />
        <ExportGuides />
      </>,
    )
    const [first, second] = screen.getAllByRole('region', { name: 'How to get your files' })
    expect(first?.getAttribute('aria-labelledby')).not.toBe(second?.getAttribute('aria-labelledby'))
  })

  it('exposes the heading to the page through headingRef, so a link can focus it', () => {
    function Harness() {
      const headingRef = useRef<HTMLHeadingElement>(null)
      return (
        <>
          <button type="button" onClick={() => headingRef.current?.focus()}>
            Go to guides
          </button>
          <ExportGuides headingRef={headingRef} />
        </>
      )
    }
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Go to guides' }))
    expect(screen.getByRole('heading', { level: 2, name: 'How to get your files' })).toHaveFocus()
  })

  it('is listed in the order of the services in the data', () => {
    render(<ExportGuides />)
    const names = screen.getAllByRole('button').map((button) => button.textContent)
    expect(names.slice(0, SERVICES.length)).toEqual(SERVICES)
  })
})
