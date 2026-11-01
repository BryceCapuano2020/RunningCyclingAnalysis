import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from './stylesheet'

const css = await readStylesheet(import.meta.url, './DeviceOffer.css')

describe('DeviceOffer stylesheet', () => {
  it('lets the offer’s sentence break inside the account’s email, which has no space to wrap at', () => {
    expect(ruleBody(css, '.device-offer p')).toMatch(/overflow-wrap:\s*anywhere/)
  })
})
