import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from '../components/stylesheet'

const app = await readStylesheet(import.meta.url, '../../App.css')
const example = await readStylesheet(import.meta.url, './LandingExample.css')
const design = await readStylesheet(import.meta.url, '../../../../../docs/DESIGN.md')

/** The text of the phone-and-narrow media query with this width, braces included, or '' when none. */
function narrowBody(maxWidth: string): string {
  const escaped = maxWidth.replace(/[()]/g, '\\$&')
  return new RegExp(`@media \\(max-width: ${escaped}\\) \\{([\\s\\S]*?)\\n\\}`).exec(app)?.[1] ?? ''
}

describe('landing start', () => {
  it('stretches the drop zone to the height of the example beside it', () => {
    expect(ruleBody(app, '.landing__start')).toMatch(/align-items:\s*stretch/)
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
    expect(ruleBody(app, '.landing-example__stats')).toMatch(/minmax\(min\(100%, 12rem\), 1fr\)/)
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
