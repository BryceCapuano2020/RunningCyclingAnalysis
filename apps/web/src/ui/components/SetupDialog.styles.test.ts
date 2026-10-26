import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from './stylesheet'

const dialogCss = await readStylesheet(import.meta.url, './SetupDialog.css')
const fieldsCss = await readStylesheet(import.meta.url, './AthleteFields.css')

/** The rules inside the phone-width media query (ui/layoutBreakpoints.ts: NARROW_PHONE_MAX_WIDTH_PX). */
function narrowBody(css: string): string {
  return /@media \(max-width: 420px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''
}

describe('setup dialog', () => {
  it('scrolls a focused field clear of the sticky footer, which covers 11 rem at its foot', () => {
    expect(ruleBody(dialogCss, '.setup-dialog')).toMatch(/scroll-padding-bottom:\s*11rem/)
  })

  it('pins its top, so the dialog does not re-centre as notes come and go', () => {
    expect(ruleBody(dialogCss, '.setup-dialog')).toMatch(/margin-block:\s*var\(--space-5\) auto/)
  })

  it('keeps the footer note row one line tall, so the footer holds still', () => {
    expect(ruleBody(dialogCss, '.setup-dialog__notes')).toMatch(/min-height:\s*1lh/)
  })

  it('gives each button a full row at phone width', () => {
    expect(narrowBody(dialogCss)).toMatch(/\.setup-dialog__actions \.btn \{[^}]*flex:\s*1 1 100%/)
  })

  it('holds two lines for the footer note at phone width, where the weight note wraps at 320 px', () => {
    expect(narrowBody(dialogCss)).toMatch(/\.setup-dialog__notes \{[^}]*min-height:\s*2lh/)
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
})
