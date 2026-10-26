import { describe, expect, it } from 'vitest'
import { readStylesheet } from './stylesheet'

const css = await readStylesheet(import.meta.url, './ShareImageButton.css')

/** The stylesheet with comments removed and every run of whitespace made a single space. */
function flat(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')
}

/** The declarations of the rule whose selector is exactly `selector`, from the flattened sheet. */
function bodyOf(source: string, selector: string): string {
  const escaped = selector.replace(/[.>]/g, '\\$&')
  const pattern = new RegExp(`(?:^| )${escaped} \\{([^{}]*)\\}`)
  return pattern.exec(flat(source))?.[1] ?? ''
}

describe('the share sheet: its preview and its actions', () => {
  it('reserves the final height of the preview, so the sheet does not jump when it draws', () => {
    expect(bodyOf(css, '.share-sheet__preview')).toContain(
      'min-height: min(var(--share-picture-vh), 28rem);',
    )
  })

  it('names the picture height once, so the preview and its cap cannot drift apart', () => {
    expect(bodyOf(css, '.share-sheet')).toContain('--share-picture-vh: 55vh;')
    expect(css.match(/55vh/g)).toHaveLength(1)
  })

  it('starts the preview at the left edge, under the shape choice', () => {
    expect(bodyOf(css, '.share-sheet__preview')).toContain('justify-items: start;')
  })

  it('caps the picture so the actions stay on a short screen', () => {
    expect(bodyOf(css, '.share-sheet__preview img')).toContain(
      'max-height: min(var(--share-picture-vh), calc(100vh - 24rem));',
    )
  })

  it('scrolls the sheet, and keeps its status and actions in a foot at the bottom of it', () => {
    expect(bodyOf(css, '.share-sheet')).toContain('overflow: auto;')
    expect(bodyOf(css, '.share-sheet__foot')).toMatch(/position: sticky;/)
    expect(bodyOf(css, '.share-sheet__foot')).toContain('bottom: 0;')
    expect(bodyOf(css, '.share-sheet__foot')).toContain('background: var(--surface-1);')
  })

  it('keeps the first action the same width as its label changes, so Close does not move', () => {
    expect(bodyOf(css, '.share-sheet__action')).toContain('min-width: 10rem;')
  })

  it('dims the last picture while the shape just chosen is drawn', () => {
    expect(bodyOf(css, '.share-sheet__picture--stale')).toContain('opacity: 0.5;')
  })
})
