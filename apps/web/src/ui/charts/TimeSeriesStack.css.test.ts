import { describe, expect, it } from 'vitest'
import { readStylesheet } from '../components/stylesheet'

const css = await readStylesheet(import.meta.url, './TimeSeriesStack.css')

/** The rules inside the forced-colours block, which the browser applies in place of the colour tokens. */
function forcedBody(): string {
  const start = css.indexOf('@media (forced-colors: active) {')
  return start === -1 ? '' : css.slice(start)
}

describe('forced colours on the timeline', () => {
  it('draws the area and the band as outlines, so a wash is not a solid block of text colour', () => {
    const forced = forcedBody()
    expect(forced).toMatch(/\.ts-stack__band,\s*\.ts-stack__area \{[^}]*fill: none/)
    expect(forced).not.toMatch(/\.ts-stack__area,\s*\.ts-stack__edge[^{]*\{[^}]*fill: CanvasText/)
  })

  it('keeps the line, the edge bars and the cursor dots in system colours', () => {
    const forced = forcedBody()
    expect(forced).toMatch(/\.ts-stack__line,[^{]*\{[^}]*stroke: CanvasText/)
    expect(forced).toMatch(/\.ts-stack__dot[^{]*\{[^}]*fill: CanvasText/)
    expect(forced).toMatch(/\.ts-stack__dot \{[^}]*stroke: Canvas/)
  })
})
