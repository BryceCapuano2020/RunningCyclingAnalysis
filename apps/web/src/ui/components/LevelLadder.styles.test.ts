import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from './stylesheet'

const css = await readStylesheet(import.meta.url, './LevelLadder.css')

/** The forced-colours block, which is written last in the stylesheet. */
const forced = css.slice(css.indexOf('@media (forced-colors: active)'))

describe('Level ladder track and marker', () => {
  it('sets a track and a marker of fixed height, so the bar does not grow with the width', () => {
    expect(ruleBody(css, '.level-ladder')).toMatch(/--level-track:\s*2rem/)
    expect(ruleBody(css, '.level-ladder')).toMatch(/--level-marker:\s*1\.5rem/)
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

describe('Level ladder bands', () => {
  it('washes each band in its own neutral level step, so a level is never a sport colour', () => {
    for (const step of [1, 2, 3, 4, 5]) {
      expect(ruleBody(css, `.level-ladder__band--${step}`)).toMatch(
        new RegExp(`background:\\s*var\\(--level-${step}\\)`),
      )
    }
  })
})

describe('Level ladder chevrons', () => {
  it('sits each chevron just outside the bar end it points past', () => {
    expect(ruleBody(css, '.level-ladder__beyond--below')).toMatch(/right:\s*100%/)
    expect(ruleBody(css, '.level-ladder__beyond--above')).toMatch(/left:\s*100%/)
  })
})

describe('Level ladder outlines', () => {
  it('outlines the range with a border, not a shadow, since forced colours drop shadows', () => {
    expect(ruleBody(css, '.level-ladder__range')).toMatch(
      /border:\s*2px solid var\(--ladder-colour\)/,
    )
    expect(ruleBody(css, '.level-ladder__range')).not.toMatch(/box-shadow/)
  })

  it('outlines the band the grade falls in with a border, not a shadow', () => {
    expect(ruleBody(css, '.level-ladder__band--current')).toMatch(
      /border:\s*1px solid var\(--ladder-colour\)/,
    )
    expect(ruleBody(css, '.level-ladder__band--current')).not.toMatch(/box-shadow/)
  })
})

describe('Level ladder forced colours', () => {
  it('draws the range as an outline only, with no band tint', () => {
    expect(forced).toMatch(/\.level-ladder__range \{\s*background:\s*none;/)
  })

  it('takes the range outline in the system text colour, so it stays visible in forced colours', () => {
    expect(forced).toMatch(/\.level-ladder__range \{[^}]*border-color:\s*CanvasText/)
  })

  it('takes the outline of every band in the system text colour', () => {
    expect(forced).toMatch(/\.level-ladder__band \{[^}]*border-color:\s*CanvasText/)
  })

  it('keeps the track edged in the system colours', () => {
    expect(forced).toMatch(/\.level-ladder__track \{[^}]*border-color:\s*CanvasText/)
  })
})
