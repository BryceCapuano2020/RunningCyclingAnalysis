import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from './stylesheet'

const STANDARD_PX = 40

const sheets = {
  accountMenu: await readStylesheet(import.meta.url, './AccountMenu.css'),
  deleteDialog: await readStylesheet(import.meta.url, './DeleteAccountDialog.css'),
  numberField: await readStylesheet(import.meta.url, './NumberField.css'),
  googleSignIn: await readStylesheet(import.meta.url, './GoogleSignInButton.css'),
  segmentedControl: await readStylesheet(import.meta.url, './SegmentedControl.css'),
  button: await readStylesheet(import.meta.url, '../../styles/components.css'),
  summary: await readStylesheet(import.meta.url, '../../styles/base.css'),
}

/** The `min-height` of a rule in px, or null when the rule sets none. */
function minHeightOf(css: string, selector: string): number | null {
  const px = /min-height:\s*(\d+)px/.exec(ruleBody(css, selector))?.[1]
  return px === undefined ? null : Number(px)
}

/**
 * Every control a person can press meets the app's 40 px standard, which is above the WCAG 2.2
 * minimum of 24 px. Each entry names the rule that sizes the control.
 */
describe('interactive targets', () => {
  it.each([
    ['sign-in button', sheets.googleSignIn, '.google-sign-in'],
    ['account trigger', sheets.accountMenu, '.account-menu__trigger'],
    ['account menu item', sheets.accountMenu, '.account-menu__item'],
    ['segmented option', sheets.segmentedControl, '.segmented-control__option'],
    ['delete email field', sheets.deleteDialog, '.delete-dialog__input'],
    ['number field', sheets.numberField, '.number-field__input input'],
    ['button', sheets.button, '.btn'],
    ['disclosure summary', sheets.summary, 'summary'],
  ])('%s is at least 40 px tall', (_name, css, selector) => {
    expect(minHeightOf(css, selector)).toBeGreaterThanOrEqual(STANDARD_PX)
  })
})
