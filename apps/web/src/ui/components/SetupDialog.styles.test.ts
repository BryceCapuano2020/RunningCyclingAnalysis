import { describe, expect, it } from 'vitest'
import { NARROW_PHONE_MAX_WIDTH_PX, SHORT_PHONE_MAX_HEIGHT_PX } from '../layoutBreakpoints'
import { readStylesheet, ruleBody } from './stylesheet'

const dialogCss = await readStylesheet(import.meta.url, './SetupDialog.css')
const fieldsCss = await readStylesheet(import.meta.url, './AthleteFields.css')
const designMd = await readStylesheet(import.meta.url, '../../../../../docs/DESIGN.md')

/** The rules inside the phone-width media query (ui/layoutBreakpoints.ts: NARROW_PHONE_MAX_WIDTH_PX). */
function narrowBody(css: string): string {
  return /@media \(max-width: 420px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''
}

/** The media query for a short phone: a narrow phone at most SHORT_PHONE_MAX_HEIGHT_PX tall. */
const SHORT_PHONE_QUERY = `@media (max-width: ${NARROW_PHONE_MAX_WIDTH_PX}px) and (max-height: ${SHORT_PHONE_MAX_HEIGHT_PX}px) {`

/** The rules inside the short phone's media query, or '' when the stylesheet has none. */
function shortPhoneBody(css: string): string {
  const start = css.indexOf(SHORT_PHONE_QUERY)
  if (start < 0) return ''
  const rest = css.slice(start + SHORT_PHONE_QUERY.length)
  return rest.slice(0, rest.indexOf('\n}'))
}

describe('setup dialog', () => {
  it('scrolls a focused field clear of the sticky footer, which covers 11 rem at its foot', () => {
    expect(ruleBody(dialogCss, '.setup-dialog')).toMatch(/scroll-padding-bottom:\s*11rem/)
  })

  it('pins its top, so the dialog does not re-centre as notes come and go', () => {
    expect(ruleBody(dialogCss, '.setup-dialog')).toMatch(/margin-block:\s*var\(--space-5\) auto/)
  })

  it('reserves one line for the weight note row above the footer, so the buttons do not move when the note goes', () => {
    expect(ruleBody(dialogCss, '.setup-dialog__notes')).toMatch(/min-height:\s*1lh/)
  })

  it('reserves two lines for that row at phone width, where the note wraps', () => {
    expect(narrowBody(dialogCss)).toMatch(/\.setup-dialog__notes \{[^}]*min-height:\s*2lh/)
  })

  it('gives each button a full row at phone width', () => {
    expect(narrowBody(dialogCss)).toMatch(/\.setup-dialog__actions \.btn \{[^}]*flex:\s*1 1 100%/)
  })

  it('is one short-phone query, named in the breakpoints file', () => {
    expect(dialogCss).toContain(SHORT_PHONE_QUERY)
  })

  it('states the same short-phone height in DESIGN.md, in the breakpoint list and the setup rule', () => {
    expect(designMd).toContain(`${SHORT_PHONE_MAX_HEIGHT_PX} px in height`)
    expect(designMd).toContain(`${SHORT_PHONE_MAX_HEIGHT_PX} px tall`)
  })

  it('sets the two footer buttons on one row on a short phone, with 8 px side padding so both labels fit 320 px', () => {
    const body = shortPhoneBody(dialogCss)
    expect(body).toMatch(/\.setup-dialog__actions \.btn \{[^}]*flex:\s*1 1 auto/)
    expect(body).toMatch(/\.setup-dialog__actions \.btn \{[^}]*padding-inline:\s*var\(--space-2\)/)
  })

  it('wraps the footer buttons by default, so larger text stacks them full width rather than cutting their labels', () => {
    expect(ruleBody(dialogCss, '.setup-dialog__actions')).toMatch(/flex-wrap:\s*wrap/)
    expect(shortPhoneBody(dialogCss)).not.toMatch(/flex-wrap:\s*nowrap/)
  })

  it('tightens the space above the fields on a short phone, so the sex options clear the sticky footer', () => {
    const body = shortPhoneBody(dialogCss)
    expect(body).toMatch(/\.setup-dialog \{[^}]*margin-block:\s*var\(--space-2\) auto/)
    expect(body).toMatch(
      /\.setup-dialog \{[^}]*max-height:\s*calc\(100dvh - 2 \* var\(--space-2\)\)/,
    )
    expect(body).toMatch(/\.setup-dialog \{[^}]*padding-top:\s*var\(--space-4\)/)
    expect(body).toMatch(/\.setup-dialog__form \{[^}]*gap:\s*var\(--space-2\)/)
  })
})

describe('athlete fields', () => {
  it('spaces the year of birth one step below its legend', () => {
    expect(ruleBody(fieldsCss, '.athlete-fields .number-field')).toMatch(
      /margin-top:\s*var\(--space-1\)/,
    )
  })

  it('gives the sex options less side padding at phone width, so their words can wrap', () => {
    expect(narrowBody(fieldsCss)).toMatch(
      /\.athlete-fields \.segmented-control__option \{[^}]*padding-inline:\s*var\(--space-1\)/,
    )
  })

  it('tightens the year and sex spacing inside the setup dialog on a short phone, so the sex options clear the sticky footer', () => {
    const body = shortPhoneBody(dialogCss)
    expect(body).toMatch(/\.setup-dialog \.athlete-fields \{[^}]*gap:\s*var\(--space-2\)/)
    expect(body).toMatch(/\.setup-dialog \.athlete-fields \.number-field \{[^}]*margin-top:\s*0/)
    expect(body).toMatch(
      /\.setup-dialog \.athlete-fields \.segmented-control__option \{[^}]*padding-block:\s*var\(--space-1\)/,
    )
  })

  it('keeps the short-phone spacing out of the shared athlete fields, so Profile keeps its own', () => {
    expect(shortPhoneBody(fieldsCss)).toBe('')
  })
})
