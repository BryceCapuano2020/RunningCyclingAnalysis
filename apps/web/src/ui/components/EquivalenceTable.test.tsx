// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { UnitSystem } from '@rca/core/units'
import { readStylesheet, ruleBody } from './stylesheet'
import { interval, makeEquivalence } from './fixtures'
import { EquivalenceTable } from './EquivalenceTable'

const equivalenceCss = await readStylesheet(import.meta.url, './EquivalenceTable.css')

/** The rules inside one @media block of a stylesheet, from its opening line to its closing brace. */
function mediaBody(css: string, query: string): string {
  const start = css.indexOf(`@media ${query} {`)
  if (start === -1) return ''
  return css.slice(start, css.indexOf('\n}', start))
}

afterEach(() => {
  cleanup()
})

function renderTable(
  equivalents = [makeEquivalence()],
  units: UnitSystem = 'metric',
  weighted = true,
  estimated: (durationS: number) => boolean = () => false,
) {
  return render(
    <EquivalenceTable
      equivalents={equivalents}
      units={units}
      weighted={weighted}
      estimated={estimated}
    />,
  )
}

describe('EquivalenceTable', () => {
  it('lists the ride effort, the flat running pace it matches and its 90% range', () => {
    renderTable()
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toEqual(['Ride effort', 'Flat pace', '90% range'])

    const row = within(screen.getByRole('row', { name: /20 min at 250 W/ }))
    expect(row.getByText('20 min at 250 W')).toBeInTheDocument()
    expect(row.getByText('4:10 /km')).toBeInTheDocument()
    // Faster pace first: the p95 speed gives the faster pace.
    expect(row.getByText('3:58 to 4:23 /km')).toBeInTheDocument()
  })

  it('shows paces per mile for imperial', () => {
    renderTable([makeEquivalence()], 'imperial')
    const table = screen.getByRole('table')
    expect(within(table).getByText('6:42 /mi')).toBeInTheDocument()
    // The unit appears once, at the end of the range.
    expect(within(table).getByText('6:23 to 7:04 /mi')).toBeInTheDocument()
  })

  it('shows one row per equivalent in order', () => {
    renderTable([
      makeEquivalence({ durationS: 300, ridePowerW: 300 }),
      makeEquivalence({ durationS: 3600, ridePowerW: 200 }),
    ])
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByText('5 min at 300 W')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('1 h at 200 W')).toBeInTheDocument()
  })

  it('tags the watts of a row estimated when its ride had no power meter, and not otherwise', () => {
    renderTable(
      [
        makeEquivalence({ durationS: 300, ridePowerW: 300 }),
        makeEquivalence({ durationS: 3600, ridePowerW: 200 }),
      ],
      'metric',
      true,
      (durationS) => durationS === 300,
    )
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]!).getByText('Estimated')).toBeInTheDocument()
    expect(within(rows[1]!).queryByText('Estimated')).not.toBeInTheDocument()
  })

  it('holds every ride figure without a weight, and asks for the weight instead', () => {
    renderTable([makeEquivalence()], 'metric', false)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText('4:10 /km')).not.toBeInTheDocument()
    expect(screen.getByText(/Add your weight on/)).toBeInTheDocument()
  })

  it('asks for a ride of 3 min when there are no equivalents', () => {
    renderTable([])
    expect(screen.getByText('Needs at least one ride of 3 min or more')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders a range that is a single pace when the interval collapses', () => {
    renderTable([makeEquivalence({ runSpeed: interval(4.0, 4.0, 4.0) })])
    expect(within(screen.getByRole('table')).getByText('4:10 to 4:10 /km')).toBeInTheDocument()
  })

  it('repeats each effort as a list for a phone, with the same values under their terms', () => {
    const { container } = renderTable([makeEquivalence({ durationS: 1200, ridePowerW: 250 })])
    const items = container.querySelectorAll('.equivalence-list > li')
    expect(items).toHaveLength(1)
    const item = items[0] as HTMLElement
    expect(Array.from(item.querySelectorAll('dt')).map((term) => term.textContent)).toEqual([
      'Ride effort',
      'Flat pace',
      '90% range',
    ])
    expect(within(item).getByText('4:10 /km')).toBeInTheDocument()
    expect(within(item).getByText('3:58 to 4:23 /km')).toBeInTheDocument()
  })

  it('shows the three labels once above the phone list, and keeps each term for a screen reader', () => {
    const { container } = renderTable([
      makeEquivalence({ durationS: 1200, ridePowerW: 250 }),
      makeEquivalence({ durationS: 1800, ridePowerW: 220 }),
    ])
    const labels = container.querySelector<HTMLElement>('.equivalence-list__labels')
    expect(labels).toHaveAttribute('aria-hidden', 'true')
    expect(
      Array.from(labels?.querySelectorAll('span') ?? []).map((span) => span.textContent),
    ).toEqual(['Ride effort', 'Flat pace', '90% range'])
    const terms = [...container.querySelectorAll<HTMLElement>('.equivalence-list dt')]
    expect(terms).toHaveLength(6)
    for (const term of terms) expect(term).toHaveClass('sr-only')
  })

  it('keeps the phone list a list for Safari, which drops a list’s role when its bullets are removed', () => {
    // list-style: none is what strips the role, so the bullets are hidden at the marker instead.
    const body = ruleBody(equivalenceCss, '.equivalence-list')
    expect(body).not.toMatch(/list-style:\s*none/)
    expect(ruleBody(equivalenceCss, '.equivalence-list li::marker')).toMatch(/content:\s*''/)
  })

  it('names the estimate on each effort in the phone list, when its watts were not measured', () => {
    const { container } = renderTable(
      [makeEquivalence({ durationS: 1200, ridePowerW: 250 })],
      'metric',
      true,
      () => true,
    )
    const list = container.querySelector('.equivalence-list') as HTMLElement
    expect(within(list).getByText('Estimated')).toBeInTheDocument()
  })

  it('shows the table from 480 px and the list below it, and hides the other at each width', () => {
    expect(mediaBody(equivalenceCss, '(min-width: 480px)')).toMatch(
      /\.equivalence-list \{\s*display: none;/,
    )
    expect(mediaBody(equivalenceCss, '(max-width: 479px)')).toMatch(
      /\.equivalence-table__wide \{\s*display: none;/,
    )
  })
})
