import { describe, expect, it } from 'vitest'
import { mediaBlock, readStylesheet, ruleBody } from '../components/stylesheet'
import { PHONE_MAX_WIDTH_PX, SHORT_PHONE_MAX_HEIGHT_PX } from '../layoutBreakpoints'

const app = await readStylesheet(import.meta.url, '../../App.css')
const example = await readStylesheet(import.meta.url, './LandingExample.css')
const design = await readStylesheet(import.meta.url, '../../../../../docs/DESIGN.md')

/** The short-phone query as App.css writes it: short, and a finger or a phone-width window. */
const SHORT_PHONE = `(max-height: ${SHORT_PHONE_MAX_HEIGHT_PX}px) and (pointer: coarse), (max-height: ${SHORT_PHONE_MAX_HEIGHT_PX}px) and (max-width: ${PHONE_MAX_WIDTH_PX}px)`
/** The same, held sideways. */
const SHORT_LANDSCAPE = `(orientation: landscape) and (max-height: ${SHORT_PHONE_MAX_HEIGHT_PX}px) and (pointer: coarse), (orientation: landscape) and (max-height: ${SHORT_PHONE_MAX_HEIGHT_PX}px) and (max-width: ${PHONE_MAX_WIDTH_PX}px)`

describe('landing start', () => {
  it('sizes the drop zone and the example to their own content and centres the pair, so neither is a tall empty box', () => {
    expect(ruleBody(app, '.landing__start')).toMatch(/align-items:\s*center/)
  })

  it('stacks the actions and the example in one column on a touch screen, with the pitch close above them', () => {
    expect(ruleBody(app, '.landing__start--touch')).toMatch(
      /grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    )
    expect(ruleBody(app, '.landing__hero:has(.landing__start--touch)')).toMatch(
      /gap:\s*var\(--space-4\)/,
    )
  })
})

describe('landing on a short landscape screen', () => {
  it('sets the pitch beside the drop zone at the height named in layoutBreakpoints.ts, so Add files is on the first screen', () => {
    expect(mediaBlock(app, SHORT_LANDSCAPE)).toMatch(
      /\.landing__hero \{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    )
  })

  it('tightens the gap in a short phone held upright, so Add files stays on the first screen at 320 x 568', () => {
    expect(mediaBlock(app, SHORT_PHONE)).toMatch(/\.landing__hero \{\s*gap:\s*var\(--space-4\);/)
  })

  it('keeps the pitch and the drop zone in one element, so the landscape layout can set them side by side', async () => {
    const landing = await readStylesheet(import.meta.url, './LandingPage.tsx')
    expect(landing).toContain('className="landing__hero"')
  })
})

describe('landing steps', () => {
  it('uses the one heading-to-text gap, space-2', () => {
    expect(ruleBody(app, '.app__steps li')).toMatch(/gap:\s*var\(--space-2\)/)
  })
})

describe('landing example', () => {
  it('is a solid frame that lets the scale shrink, and has none of the old ladder rows', () => {
    expect(ruleBody(app, '.landing-example')).toMatch(/min-width:\s*0/)
    for (const old of [
      '.landing-example__stats',
      '.landing-example__figure',
      '.landing-example__number',
    ]) {
      expect(ruleBody(app, old)).toBe('')
    }
    expect(ruleBody(example, '.landing-example__sport')).toBe('')
  })

  it('names the level scale it draws, in DESIGN.md', () => {
    expect(design).toMatch(/landing example is drawn from the same sample[^.]*level scale/)
  })
})
