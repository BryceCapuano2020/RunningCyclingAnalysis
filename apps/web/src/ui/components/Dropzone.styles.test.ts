import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from './stylesheet'

const css = await readStylesheet(import.meta.url, './Dropzone.css')

describe('Dropzone stylesheet', () => {
  it('is not drawn as a drop box on any screen: no outline, fill or padding, just the actions', () => {
    for (const selector of ['.dropzone', '.dropzone--touch', '.dropzone__target']) {
      expect(ruleBody(css, selector), selector).not.toMatch(/border|background|padding|shadow/)
    }
  })

  it('carries no line under the title: no hint, drag text or guides link', () => {
    for (const selector of ['.dropzone__hint', '.dropzone__drag', '.dropzone__guides']) {
      expect(css, selector).not.toContain(selector)
    }
  })
})

describe('Dropzone target', () => {
  it('draws no fill on hover, since the drop area is not a control', () => {
    expect(ruleBody(css, '.dropzone__target:hover')).toBe('')
  })

  it('draws no press of its own, since the drop area is not a control', () => {
    expect(ruleBody(css, '.dropzone__target:active')).toBe('')
  })

  it('centres its content vertically, so a taller example leaves the drop area centred', () => {
    expect(ruleBody(css, '.dropzone')).toMatch(/align-content:\s*center/)
  })
})
