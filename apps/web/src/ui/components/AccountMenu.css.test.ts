import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from './stylesheet'

const css = await readStylesheet(import.meta.url, './AccountMenu.css')

describe('AccountMenu stylesheet', () => {
  it('sizes the avatar in rem, so initials at 200% text are not cut off by a fixed 32 px circle', () => {
    const avatar = ruleBody(css, '.account-menu__avatar')
    expect(avatar).toMatch(/width:\s*2rem/)
    expect(avatar).toMatch(/height:\s*2rem/)
    expect(avatar).not.toMatch(/\d+px/)
  })
})
