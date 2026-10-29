import { describe, expect, it } from 'vitest'
import { mediaBlock, readStylesheet, ruleBody } from '../components/stylesheet'
import { PHONE_MAX_WIDTH_PX, SHORT_PHONE_MAX_HEIGHT_PX } from '../layoutBreakpoints'

const app = await readStylesheet(import.meta.url, '../../App.css')
const example = await readStylesheet(import.meta.url, './LandingExample.css')
const design = await readStylesheet(import.meta.url, '../../../../../docs/DESIGN.md')
const tokens = await readStylesheet(import.meta.url, '../../styles/tokens.css')

/** The short-phone query as App.css writes it: short, and a finger or a phone-width window. */
const SHORT_PHONE = `(max-height: ${SHORT_PHONE_MAX_HEIGHT_PX}px) and (pointer: coarse), (max-height: ${SHORT_PHONE_MAX_HEIGHT_PX}px) and (max-width: ${PHONE_MAX_WIDTH_PX}px)`
/** The same, held sideways. */
const SHORT_LANDSCAPE = `(orientation: landscape) and (max-height: ${SHORT_PHONE_MAX_HEIGHT_PX}px) and (pointer: coarse), (orientation: landscape) and (max-height: ${SHORT_PHONE_MAX_HEIGHT_PX}px) and (max-width: ${PHONE_MAX_WIDTH_PX}px)`

/** The text of the phone-and-narrow media query with this width, braces included, or '' when none. */
function narrowBody(maxWidth: string): string {
  const escaped = maxWidth.replace(/[()]/g, '\\$&')
  return new RegExp(`@media \\(max-width: ${escaped}\\) \\{([\\s\\S]*?)\\n\\}`).exec(app)?.[1] ?? ''
}

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
  it('sets its figures at the body size, which DESIGN.md names, not at the 48 px hero size', () => {
    expect(design).toMatch(/its figures at the body size/)
    expect(design).not.toMatch(/48 px hero size/)
    expect(ruleBody(example, '.landing-example__sport-name')).not.toMatch(/font-size/)
  })

  it('has no rules for the dt, dd and stat-number markup it does not use', () => {
    expect(ruleBody(app, '.landing-example__stats dt')).toBe('')
    expect(ruleBody(app, '.landing-example__stats dd')).toBe('')
    expect(ruleBody(app, '.landing-example__stats .stat-number')).toBe('')
  })

  it('needs 12rem for each sport before it sits beside the other, so their scale labels never collide', () => {
    expect(ruleBody(app, '.landing-example__stats')).toMatch(
      /minmax\(min\(100%, var\(--column-example\)\), 1fr\)/,
    )
    expect(tokens).toMatch(/--column-example:\s*12rem/)
  })

  it('stacks the two sports in one column below 560 px, where their scale labels would collide', () => {
    expect(narrowBody('560px')).toMatch(
      /\.landing-example__stats \{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/,
    )
  })

  it('aligns the sports row by row, through subgrid, so their names, ladders and measures line up', () => {
    const sport = ruleBody(example, '.landing-example__sport')
    expect(sport).toMatch(/grid-row:\s*span 3;/)
    expect(sport).toMatch(/grid-template-rows:\s*subgrid;/)
  })
})
