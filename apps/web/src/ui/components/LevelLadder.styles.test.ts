import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from './stylesheet'

const css = await readStylesheet(import.meta.url, './LevelLadder.css')

/** The forced-colours block, which is written last in the stylesheet. */
const forced = css.slice(css.indexOf('@media (forced-colors: active)'))

describe('Level ladder track and marker', () => {
  it('sets a track and a marker of fixed height, so the bar does not grow with the width', () => {
    expect(ruleBody(css, '.level-ladder')).toMatch(/--level-track:\s*1rem/)
    expect(ruleBody(css, '.level-ladder')).toMatch(/--level-marker:\s*1\.25rem/)
    expect(ruleBody(css, '.level-ladder__track')).toMatch(/height:\s*var\(--level-track\)/)
  })

  it('keeps the marker inside the track at either end, and at its place on the scale otherwise', () => {
    expect(ruleBody(css, '.level-ladder__marker')).toMatch(
      /left:\s*clamp\(calc\(var\(--level-marker\) \/ 2\),\s*var\(--at\),\s*calc\(100% - var\(--level-marker\) \/ 2\)\)/,
    )
  })

  it('clips the bands to the rounded track, so the squared band ends stay inside its curve', () => {
    expect(ruleBody(css, '.level-ladder__fill')).toMatch(/overflow:\s*hidden/)
    expect(ruleBody(css, '.level-ladder__fill')).toMatch(/border-radius:\s*inherit/)
  })
})

describe('Level ladder chevrons', () => {
  it('sits each chevron just outside the bar end it points past', () => {
    expect(ruleBody(css, '.level-ladder__beyond--below')).toMatch(/right:\s*100%/)
    expect(ruleBody(css, '.level-ladder__beyond--above')).toMatch(/left:\s*100%/)
  })
})

describe('Level ladder forced colours', () => {
  it('draws the range as an outline only, with no band tint', () => {
    expect(forced).toMatch(/\.level-ladder__range \{\s*background:\s*none;/)
  })

  it('keeps the track edged in the system colours', () => {
    expect(forced).toMatch(/\.level-ladder__track \{[^}]*border-color:\s*CanvasText/)
  })
})
