import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../components/stylesheet'

const page = await readStylesheet(import.meta.url, './ActivityPage.css')
const deleteCss = await readStylesheet(import.meta.url, '../components/ActivityDelete.css')
const route = await readStylesheet(import.meta.url, '../components/RouteShape.css')
const splits = await readStylesheet(import.meta.url, '../components/SplitsTable.css')

/** The declarations of every rule whose selector is `selector`, indented or not, in source order. */
function declarations(css: string, selector: string): string {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(?:^|\\n)\\s*${escaped} \\{([^}]*)\\}`, 'g')
  return [...bare.matchAll(pattern)].map((match) => match[1] ?? '').join('\n')
}

/** The text of the @media block with this query, from its opening line to its closing brace. */
function inMedia(css: string, query: string): string {
  const start = css.indexOf(`@media ${query} {`)
  if (start < 0) return ''
  return css.slice(start, css.indexOf('\n}', start))
}

describe('activity page stylesheet', () => {
  it('balances the lines of the page title, so a long name does not end on a short line', () => {
    expect(declarations(page, '.activity-page__title')).toMatch(/text-wrap:\s*balance;/)
  })

  it('balances the lines of the links around the activity', () => {
    expect(declarations(page, '.activity-page__nav a')).toMatch(/text-wrap:\s*balance;/)
  })

  it('hides the bullets of the skipped readings with an empty marker, so the list keeps its semantics', () => {
    const flags = declarations(page, '.activity-page__flags')
    expect(flags).not.toMatch(/list-style:\s*none;/)
    expect(flags).toMatch(/padding-left:\s*0;/)
    expect(declarations(page, '.activity-page__flags li::marker')).toMatch(/content:\s*'';/)
  })

  it('keeps the splits list a list, hiding its numbers with an empty marker and not list-style none', () => {
    expect(declarations(splits, '.splits-list')).not.toMatch(/list-style:\s*none;/)
    expect(declarations(splits, '.splits-list__item::marker')).toMatch(/content:\s*'';/)
  })

  it('spans a lone last stat across both columns on a phone', () => {
    expect(inMedia(page, '(max-width: 479px)')).toMatch(
      /\.activity-page__stat:last-child:nth-child\(odd\) \{[^}]*grid-column:\s*1 \/ -1;/,
    )
  })
})

describe('delete question', () => {
  it('starts the question actions at the left, under the question they answer', () => {
    expect(declarations(deleteCss, '.activity-delete__question .confirm-actions')).toMatch(
      /justify-content:\s*flex-start;/,
    )
  })
})

describe('route shape', () => {
  it('has no margin of its own, so the page gap alone spaces it', () => {
    expect(declarations(route, '.route-shape')).toMatch(/margin:\s*0;/)
  })
})

describe('splits table', () => {
  it('aligns the caption with the section heading, not inset by the cell padding', () => {
    expect(declarations(splits, '.splits-table caption')).toMatch(
      /padding:\s*0 0 var\(--space-2\);/,
    )
  })

  it('sets each split on two or three lines below 480 px, its split and pace first, and wraps the rest', () => {
    expect(declarations(splits, '.splits-list dl')).toMatch(/flex-wrap:\s*wrap;/)
    expect(declarations(splits, '.splits-list dl > div:nth-child(2)')).toMatch(
      /margin-left:\s*auto;/,
    )
  })

  it('keeps the Fastest chip from growing its row', () => {
    expect(declarations(splits, '.splits-table .chip')).toMatch(/margin-block:\s*-3px;/)
  })
})
