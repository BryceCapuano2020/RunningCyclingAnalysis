import { describe, expect, it } from 'vitest'
import { mediaBlock, readStylesheet, ruleBody } from '../components/stylesheet'

const tileCss = await readStylesheet(import.meta.url, './StatTile.css')
const trackCss = await readStylesheet(import.meta.url, './RangeTrack.css')

const css = await readStylesheet(import.meta.url, './BalanceScale.css')
const forced = mediaBlock(css, '(forced-colors: active)')

describe('level scale stylesheet', () => {
  it('paints each band from its own level token, one wash for each of the five levels', () => {
    expect(ruleBody(css, '.balance-scale__band')).toMatch(/fill:\s*var\(--level-1\)/)
    for (const level of [2, 3, 4, 5]) {
      expect(ruleBody(css, `.balance-scale__band[data-level='${level}']`)).toMatch(
        new RegExp(`fill:\\s*var\\(--level-${level}\\)`),
      )
    }
  })

  it('takes a sport’s colour from data-sport, for its dot, ring, band and caps, never a series token', () => {
    expect(css).not.toMatch(/--series-/)
    expect(ruleBody(css, '.balance-scale__dot')).toMatch(/fill:\s*var\(--sport-colour\)/)
    expect(ruleBody(css, '.balance-scale__ring')).toMatch(/stroke:\s*var\(--sport-colour\)/)
    expect(ruleBody(css, '.balance-scale__range')).toMatch(/fill:\s*var\(--sport-colour-soft\)/)
    expect(ruleBody(css, '.balance-scale__cap')).toMatch(/stroke:\s*var\(--sport-colour\)/)
  })

  it('draws an estimate as a ring and a translucent band, never a dashed line', () => {
    expect(css).not.toMatch(/stroke-dasharray/)
    expect(ruleBody(css, '.balance-scale__ring')).toMatch(/fill:\s*var\(--surface-1\)/)
  })

  it('sets the sport colour on shapes only: no text takes it', () => {
    for (const selector of [
      '.balance-scale__big',
      '.balance-scale__sub',
      '.balance-scale__line',
      '.balance-scale__sport',
    ]) {
      expect(ruleBody(css, selector), selector).not.toMatch(/sport-colour/)
    }
  })

  it('writes no colour literal, so both schemes follow the tokens', () => {
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
  })

  it('gives each band a system edge and the marks system colours in forced colours', () => {
    expect(forced).toMatch(/\.balance-scale__band[^{]*\{[^}]*stroke:\s*CanvasText/)
    expect(forced).toMatch(/\.balance-scale__dot \{[^}]*fill:\s*CanvasText/)
    expect(forced).toMatch(/\.balance-scale__ring[^{]*\{[^}]*stroke:\s*CanvasText/)
    expect(forced).toMatch(/\.balance-scale__range \{[^}]*stroke:\s*CanvasText/)
  })

  it('lets the key and the title share a row on a wide screen and puts the key under the drawing on a phone', () => {
    expect(ruleBody(css, '.balance-scale')).toMatch(/'title legend'/)
    expect(mediaBlock(css, '(max-width: 760px)')).toMatch(/'figure'\s*'legend'/)
  })

  it('gives a tile’s evidence chip an edge and system colours in forced colours', () => {
    const forced = mediaBlock(tileCss, '(forced-colors: active)')
    expect(forced).toMatch(/\.stat-tile__basis \{[^}]*border:\s*1px solid CanvasText/)
    expect(forced).toMatch(/\.stat-tile__basis::before \{[^}]*CanvasText/)
  })

  it('draws a fit spread slimmer than a 90% range, with an outline for a band', () => {
    expect(ruleBody(trackCss, '.range-track')).toMatch(/--track:\s*16px/)
    expect(ruleBody(trackCss, '.range-track--spread')).toMatch(/--track:\s*10px/)
    expect(ruleBody(trackCss, '.range-track--spread .range-track__band')).toMatch(
      /background:\s*transparent/,
    )
  })
})
