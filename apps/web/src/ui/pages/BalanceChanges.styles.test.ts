import { describe, expect, it } from 'vitest'
import { mediaBlock, readStylesheet, ruleBody } from '../components/stylesheet'
import { PHONE_MAX_WIDTH_PX } from '../layoutBreakpoints'

const css = await readStylesheet(import.meta.url, './BalanceChanges.css')

describe('What changed on a phone', () => {
  it('stacks the cards in one column at the phone width, where a wide screen sets them in a row', () => {
    // Wide: as many columns as fit. A column here is the narrowest a card can be, so two would squeeze on a phone.
    expect(ruleBody(css, '.balance-changes__list')).toMatch(
      /grid-template-columns: repeat\(auto-fit,/,
    )
    const phone = mediaBlock(css, `(max-width: ${PHONE_MAX_WIDTH_PX}px)`)
    expect(phone).toMatch(/\.balance-changes__list \{[^}]*grid-template-columns: 1fr;/)
  })

  it('drops the hairline between cards in the same query, since a single column has no neighbour beside it', () => {
    const phone = mediaBlock(css, `(max-width: ${PHONE_MAX_WIDTH_PX}px)`)
    expect(phone).toMatch(
      /\.balance-changes__item \+ \.balance-changes__item::before \{[^}]*display: none/,
    )
  })
})
