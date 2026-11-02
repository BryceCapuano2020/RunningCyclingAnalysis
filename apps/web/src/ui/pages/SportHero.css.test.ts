import { describe, expect, it } from 'vitest'
import { mediaBlock, readStylesheet } from '../components/stylesheet'

const css = await readStylesheet(import.meta.url, './SportHero.css')

describe('Sport hero stylesheet', () => {
  it('sets the figure at a line height of 1 in forced colours, so its backplate stays off the chip above', () => {
    const forced = mediaBlock(css, '(forced-colors: active)')
    expect(forced).toMatch(/\.sport-hero__number \{\s*line-height:\s*1;/)
    expect(forced).toMatch(/\.sport-hero__level \{[^}]*line-height:\s*1;/)
  })
})
