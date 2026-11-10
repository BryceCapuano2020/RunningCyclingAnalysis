// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { dotsFixture, slipAndRise } from '../test/fitnessYearsFixtures'
import { SportHistory } from './SportHistory'

afterEach(cleanup)

const LINK = { href: '#/history', text: 'See History' }

describe('SportHistory', () => {
  it('draws the years as dots with the slips shaded, keeps the finding as the graph text, and links to History', () => {
    const dots = dotsFixture({ years: [2021, 2022, 2023], spans: slipAndRise(2021) })
    const { container } = render(
      <SportHistory
        sport="run"
        dots={dots}
        units="metric"
        finding="Slipped in 2021, then came back"
        link={LINK}
      />,
    )
    const section = screen.getByRole('region', { name: 'History' })
    expect(within(section).getByRole('figure', { name: 'History' })).toBeInTheDocument()
    expect(container.querySelectorAll('[data-testid="fitness-span"]').length).toBeGreaterThan(0)
    expect(section.querySelector('.chart-frame__lede')?.textContent).toBe(
      'Slipped in 2021, then came back',
    )
    expect(within(section).getByRole('link', { name: 'See History' })).toHaveAttribute(
      'href',
      '#/history',
    )
    expect(section.querySelector('.chart-frame__legend')).toBeNull()
  })

  it('keeps the axes and the dots it has for a sport too short for a history, with the reason as its caption', () => {
    const { container } = render(
      <SportHistory
        sport="ride"
        dots={dotsFixture({ sport: 'ride', years: [2025], perYear: 5 })}
        units="metric"
        finding="Not enough steady rides for a fitness history."
        reason="Not enough steady rides for a fitness history."
        link={LINK}
      />,
    )
    expect(container.querySelector('[data-testid="fitness-dots"]')).not.toBeNull()
    expect(container.querySelector('p.muted')?.textContent).toBe(
      'Not enough steady rides for a fitness history. See History',
    )
  })
})
