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

  it('caps each weight column at 8rem, so the bike field stays beside the body field with an error or a Save open', () => {
    const field =
      /\.settings-bar__field \{([^}]*)\}/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ''))?.[1] ?? ''
    expect(field).toMatch(/max-width:\s*8rem;/)
  })
})
