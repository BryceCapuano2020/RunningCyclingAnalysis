import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from './stylesheet'

const css = await readStylesheet(import.meta.url, './LevelLadder.css')

/** The forced-colours block, which is written last in the stylesheet. */
const forced = css.slice(css.indexOf('@media (forced-colors: active)'))

describe('Level ladder track and marker', () => {
  it('sets a track and a marker of fixed height, so the bar does not grow with the width', () => {
    expect(ruleBody(css, '.level-ladder')).toMatch(/--level-track:\s*1\.25rem/)
    expect(ruleBody(css, '.level-ladder')).toMatch(/--level-marker:\s*0\.625rem/)
    expect(ruleBody(css, '.level-ladder__track')).toMatch(/height:\s*var\(--level-track\)/)
  })

  it('keeps the marker inside the track at either end, and at its place on the scale otherwise', () => {
    expect(ruleBody(css, '.level-ladder__marker')).toMatch(
      /left:\s*clamp\(calc\(var\(--level-marker\) \/ 2\),\s*var\(--at\),\s*calc\(100% - var\(--level-marker\) \/ 2\)\)/,
    )
  })

  it('draws the track as a 1 px hairline, with a tick at each band’s edge', () => {
    expect(ruleBody(css, '.level-ladder__track::before')).toMatch(/height:\s*1px/)
    expect(ruleBody(css, '.level-ladder__track::before')).toMatch(/background:\s*var\(--hairline\)/)
    expect(ruleBody(css, '.level-ladder__edge')).toMatch(/background:\s*var\(--ink-secondary\)/)
  })

  it('marks the grade in ink alone: a dot for a recorded effort, a ring for an estimate', () => {
    expect(ruleBody(css, '.level-ladder__dot')).toMatch(/background:\s*var\(--ink\)/)
    expect(ruleBody(css, '.level-ladder__ring')).toMatch(/border:\s*1\.5px solid var\(--ink\)/)
  })
})

describe('Level ladder bands', () => {
  it('fills no band: the current level is named in ink, the others in the secondary ink', () => {
    expect(css).not.toMatch(/level-ladder__band|var\(--level-\d\)/)
    expect(ruleBody(css, '.level-ladder__name--current')).toMatch(/color:\s*var\(--ink\)/)
    expect(css).toMatch(
      /\.level-ladder__pct,\s*\.level-ladder__name \{[^}]*color:\s*var\(--ink-secondary\)/,
    )
  })

  it('names the levels and the percentages in the mono meta face', () => {
    expect(css).toMatch(
      /\.level-ladder__pct,\s*\.level-ladder__name \{[^}]*font-family:\s*var\(--font-mono\);[^}]*text-transform:\s*uppercase/,
    )
  })
})

describe('Level ladder chevrons', () => {
  it('sits each chevron just outside the bar end it points past', () => {
    expect(ruleBody(css, '.level-ladder__beyond--below')).toMatch(/right:\s*100%/)
    expect(ruleBody(css, '.level-ladder__beyond--above')).toMatch(/left:\s*100%/)
  })
})

describe('Level ladder range', () => {
  it('draws a ride’s range as its wash along the line, with no outline or shadow', () => {
    expect(ruleBody(css, '.level-ladder__range')).toMatch(/background:\s*var\(--sport-wash\)/)
    expect(ruleBody(css, '.level-ladder__range')).not.toMatch(/border|box-shadow/)
  })
})

describe('Level ladder forced colours', () => {
  it('draws the range in the system highlight, where its wash is dropped', () => {
    expect(forced).toMatch(/\.level-ladder__range \{\s*background:\s*Highlight;/)
  })

  it('takes the line, the ticks and the dot in the system text colour', () => {
    expect(forced).toMatch(
      /\.level-ladder__track::before,\s*\.level-ladder__edge,\s*\.level-ladder__dot \{\s*background:\s*CanvasText/,
    )
  })

  it('underlines the current level, where its ink is lost', () => {
    expect(forced).toMatch(/\.level-ladder__name--current \{\s*text-decoration:\s*underline/)
  })
})
