import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from './stylesheet'

const css = await readStylesheet(import.meta.url, './SettingsBar.css')

/** The declarations of the weights row, with comments removed. */
const fieldsRow =
  /\.settings-bar__fields \{([^}]*)\}/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ''))?.[1] ?? ''

describe('SettingsBar stylesheet', () => {
  it('lays the weights out as a grid, one column each, with the tops aligned', () => {
    expect(fieldsRow).toMatch(/display:\s*grid;/)
    expect(fieldsRow).toMatch(/align-items:\s*start;/)

    // The weight columns are their inputs' width, not sized to their content, so a warning cannot widen them.
    expect(fieldsRow).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 11ch\)\)/)
  })

  it('lets a warning and its Save span the row under both weights, so a weight column keeps its width', () => {
    expect(ruleBody(css, '.settings-bar__fields .number-field__error')).toMatch(
      /grid-column:\s*1 \/ -1;/,
    )
    expect(ruleBody(css, '.settings-bar__fields .btn')).toMatch(/grid-column:\s*1 \/ -1;/)
  })

  it('no longer caps the weight column, since a warning no longer sits in it', () => {
    const field = ruleBody(css, '.settings-bar__field')
    expect(field).not.toMatch(/max-width/)
  })

  it('reserves the status line at one line of its own text, not a fixed rem', () => {
    expect(ruleBody(css, '.settings-bar__status')).toMatch(/min-height:\s*1lh;/)
  })
})
