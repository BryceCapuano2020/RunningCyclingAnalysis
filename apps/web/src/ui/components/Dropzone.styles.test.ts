import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from './stylesheet'

const css = await readStylesheet(import.meta.url, './Dropzone.css')

/** The rules inside a media query, up to the brace that closes it at the start of a line. */
function mediaBody(query: string): string {
  const escaped = query.replace(/[()]/g, '\\$&')
  return new RegExp(`@media ${escaped} \\{([\\s\\S]*?)\\n\\}`).exec(css)?.[1] ?? ''
}

describe('Dropzone stylesheet', () => {
  it('hides the drag text on a touch screen, where a file cannot be dropped', () => {
    expect(mediaBody('(pointer: coarse)')).toMatch(/\.dropzone__drag \{\s*display: none;/)
  })

  it('hides the touch-only line on a pointer, and keeps the drag text there', () => {
    expect(mediaBody('(pointer: fine)')).toMatch(/\.dropzone__touch \{\s*display: none;/)
    const outsideTouch = css.replace(mediaBody('(pointer: coarse)'), '')
    expect(outsideTouch).not.toMatch(/\.dropzone__drag \{\s*display: none/)
  })
})

describe('Dropzone target', () => {
  it('fills the drop area on hover, so it reads as a place to drop files', () => {
    expect(ruleBody(css, '.dropzone__target:hover')).toMatch(/background:\s*var\(--surface-2\)/)
  })

  it('draws no press of its own, since the drop area is not a control', () => {
    expect(ruleBody(css, '.dropzone__target:active')).toBe('')
  })
})
