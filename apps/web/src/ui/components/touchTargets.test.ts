import { describe, expect, it } from 'vitest'
import { readStylesheet, ruleBody } from './stylesheet'

const STANDARD_PX = 40

const sheets = {
  accountMenu: await readStylesheet(import.meta.url, './AccountMenu.css'),
  deleteDialog: await readStylesheet(import.meta.url, './DeleteAccountDialog.css'),
  googleSignIn: await readStylesheet(import.meta.url, './GoogleSignInButton.css'),
  segmentedControl: await readStylesheet(import.meta.url, './SegmentedControl.css'),
  global: await readStylesheet(import.meta.url, '../../index.css'),
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
    ['button', sheets.global, '.btn'],
    ['disclosure summary', sheets.global, 'summary'],
  ])('%s is at least 40 px tall', (_name, css, selector) => {
    expect(minHeightOf(css, selector)).toBeGreaterThanOrEqual(STANDARD_PX)
  })
})
