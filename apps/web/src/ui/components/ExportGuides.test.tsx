// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EXPORT_GUIDES } from '../exportGuides'
import { ExportGuides } from './ExportGuides'

afterEach(() => {
  cleanup()
})

const SERVICES = ['Strava', 'Garmin Connect', 'Wahoo', 'COROS', 'Zwift']

/** The closed details that holds one service's guide, found by the service's name in its summary. */
function guideFor(service: string): HTMLElement {
  const name = screen.getByText(service, { selector: '.export-guide__name' })
  const details = name.closest('details')
  if (!details) throw new Error(`No details for ${service}`)
  return details
}

describe('ExportGuides', () => {
  it('is a section headed "How to get your files"', () => {
    render(<ExportGuides />)
    expect(screen.getByRole('region', { name: 'How to get your files' })).toBeInTheDocument()
  })

  it('renders every service, each as a details element that starts closed', () => {
    const { container } = render(<ExportGuides />)
    expect(container.querySelectorAll('details')).toHaveLength(SERVICES.length)
    for (const service of SERVICES) {
      expect(guideFor(service)).not.toHaveAttribute('open')
    }
  })

  it('keeps each service name in the summary as text, not as a heading', () => {
    const { container } = render(<ExportGuides />)
    expect(container.querySelector('summary h2, summary h3')).toBeNull()
  })

  it('lists three to five steps for each service as an ordered list', () => {
    render(<ExportGuides />)
    for (const service of SERVICES) {
      const list = within(guideFor(service)).getByRole('list')
      expect(list.tagName).toBe('OL')
      expect(within(list).getAllByRole('listitem').length).toBeGreaterThanOrEqual(3)
      expect(within(list).getAllByRole('listitem').length).toBeLessThanOrEqual(5)
    }
  })

  it('shows the steps in the order the data gives them', () => {
    render(<ExportGuides />)
    const strava = EXPORT_GUIDES.find((guide) => guide.service === 'Strava')
    const items = within(guideFor('Strava')).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(strava?.steps)
  })

  it('says what each export contains, in one line', () => {
    render(<ExportGuides />)
    for (const guide of EXPORT_GUIDES) {
      expect(within(guideFor(guide.service)).getByText(guide.contains)).toBeInTheDocument()
    }
  })

  it('links each service to its help, with the right address and a safe rel', () => {
    render(<ExportGuides />)
    for (const guide of EXPORT_GUIDES) {
      const link = within(guideFor(guide.service)).getByRole('link', { name: guide.helpLabel })
      expect(link).toHaveAttribute('href', guide.helpUrl)
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })

  it('labels Strava as full steps on its help, and the other services by what the link is', () => {
    render(<ExportGuides />)
    expect(
      within(guideFor('Strava')).getByRole('link', { name: 'Full steps on Strava help' }),
    ).toBeInTheDocument()
    expect(
      within(guideFor('Garmin Connect')).getByRole('link', { name: 'Garmin support' }),
    ).toBeInTheDocument()
    for (const service of ['Wahoo', 'COROS', 'Zwift']) {
      expect(
        within(guideFor(service)).getByRole('link', { name: `${service} help` }),
      ).toBeInTheDocument()
    }
  })

  it('says that the Strava export arrives by email and that its zip can be dropped as it is', () => {
    render(<ExportGuides />)
    const strava = within(guideFor('Strava'))
    expect(strava.getByText(/arrives by email/)).toBeInTheDocument()
    expect(strava.getByText(/a few hours/)).toBeInTheDocument()
    expect(strava.getByText(/Drop the zip here as it is/)).toBeInTheDocument()
  })

  it('notes on every guide that was not checked that steps and menu names can differ', () => {
    render(<ExportGuides />)
    const note = 'These steps are general: menu names and delivery can differ by app version.'
    for (const guide of EXPORT_GUIDES) {
      const found = within(guideFor(guide.service)).queryByText(note)
      if (guide.verified) expect(found).toBeNull()
      else expect(found).toBeInTheDocument()
    }
    expect(EXPORT_GUIDES.filter((guide) => !guide.verified).map((guide) => guide.service)).toEqual([
      'Garmin Connect',
      'Wahoo',
      'COROS',
      'Zwift',
    ])
  })

  it('makes no claim about delivery or limits on a guide that was not checked', () => {
    const text = EXPORT_GUIDES.filter((guide) => !guide.verified)
      .map((guide) => [guide.contains, guide.steps.join(' ')].join(' '))
      .join(' ')
    expect(text).not.toMatch(/by email|last 250|sent there|that email/)
  })

  it('states no menu name as fact on a guide that was not checked', () => {
    for (const guide of EXPORT_GUIDES.filter((item) => !item.verified)) {
      for (const step of guide.steps) expect(step).not.toMatch(/"/)
      expect(guide.contains).not.toMatch(/"/)
    }
  })
})
