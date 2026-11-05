import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from './stylesheet'

const css = await readStylesheet(import.meta.url, './AccountMenu.css')

describe('AccountMenu stylesheet', () => {
  it('sets the trigger as the name in plain text: no border, fill or pill', () => {
    const trigger = ruleBody(css, '.account-menu__trigger')
    expect(trigger).toMatch(/border:\s*0/)
    expect(trigger).toMatch(/background:\s*none/)
    expect(css).not.toMatch(/radius-pill|account-menu__avatar/)
  })
})
