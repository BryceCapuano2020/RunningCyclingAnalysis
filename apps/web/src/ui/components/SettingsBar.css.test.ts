import { describe, expect, it } from 'vitest'
import { readStylesheet } from './stylesheet'

const css = await readStylesheet(import.meta.url, './SettingsBar.css')

/** The declarations of the weights row, with comments removed. */
const fieldsRow =
  /\.settings-bar__fields \{([^}]*)\}/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ''))?.[1] ?? ''

describe('SettingsBar stylesheet', () => {
  it('aligns the two weights to their tops, so a neighbour does not move when an error appears', () => {
    expect(fieldsRow).toMatch(/align-items:\s*flex-start;/)
  })
})
