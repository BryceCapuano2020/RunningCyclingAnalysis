import { describe, expect, it } from 'vitest'
import { PHONE_MAX_WIDTH_PX } from '../layoutBreakpoints'
import { readStylesheet } from './stylesheet'

const css = await readStylesheet(import.meta.url, './ImportStatus.css')
const tokensCss = await readStylesheet(import.meta.url, '../../styles/tokens.css')

/** The stylesheet with comments removed and every run of whitespace made a single space. */
function flat(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')
}

/** Each rule's selector and declarations, from the flattened stylesheet, nested rules included. */
function rulesOf(source: string): { selector: string; body: string }[] {
  return [...flat(source).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
    ([, selector = '', body = '']) => ({
      selector: selector.trim(),
      body: body.trim(),
    }),
  )
}

/** The media block of a stylesheet at a given width, from its opening rule to its closing brace. */
function mediaBlock(source: string, maxWidth: number): string {
  const open = source.indexOf(`@media (max-width: ${maxWidth}px) {`)
  if (open < 0) return ''
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return flat(source.slice(open, i + 1))
    }
  }
  return ''
}

describe('ImportStatus: the busy strip on a phone', () => {
  it('lifts above the tab bar only while the tab bar is shown, which is when there is a result', () => {
    const lifted = rulesOf(css).filter((rule) => rule.body.includes('var(--tab-bar-height)'))
    expect(lifted.map((rule) => rule.selector)).toEqual([
      '.page:has(> .header > .header__tabs) .import-status',
    ])
    expect(lifted[0]?.body).toBe(
      'bottom: calc(var(--tab-bar-height) + env(safe-area-inset-bottom));',
    )
  })

  it('makes that lift part of the phone breakpoint, not of every screen', () => {
    expect(mediaBlock(css, PHONE_MAX_WIDTH_PX)).toContain(
      '.page:has(> .header > .header__tabs) .import-status { bottom: calc(var(--tab-bar-height) + env(safe-area-inset-bottom)); }',
    )
  })

  it('uses the phone breakpoint named in layoutBreakpoints.ts, and the tab bar height token', () => {
    expect(css).toContain(`@media (max-width: ${PHONE_MAX_WIDTH_PX}px)`)
    expect(tokensCss).toMatch(/--tab-bar-height:\s*48px/)
  })

  it('keeps the strip at the foot of the window everywhere else', () => {
    const base = rulesOf(css).find((rule) => rule.selector === '.import-status')
    expect(base?.body).toContain('bottom: 0;')
  })
})
