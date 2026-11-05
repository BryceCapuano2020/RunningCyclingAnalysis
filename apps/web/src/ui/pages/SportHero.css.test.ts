import { describe, expect, it } from 'vitest'
import { mediaBlock, readStylesheet } from '../components/stylesheet'

const css = await readStylesheet(import.meta.url, './SportHero.css')

describe('Sport hero stylesheet', () => {
  it('sets the figure at a line height of 1 in forced colours, so its backplate stays off the title above', () => {
    const forced = mediaBlock(css, '(forced-colors: active)')
    expect(forced).toMatch(/\.sport-hero__number \{\s*line-height:\s*1;/)
  })

  it('sets the level and its percent on one serif line, with no display size or capitals', () => {
    expect(css).toMatch(/\.sport-hero__level \{[^}]*font-family:\s*var\(--font-serif\)/)
    expect(css).not.toMatch(/text-transform|--display-2|--display-3/)
  })
})
