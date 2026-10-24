import { describe, expect, it } from 'vitest'
import { readStylesheet } from './stylesheet'

const STANDARD_PX = 40

const sheets = {
  accountMenu: await readStylesheet(import.meta.url, './AccountMenu.css'),
  deleteDialog: await readStylesheet(import.meta.url, './DeleteAccountDialog.css'),
  numberField: await readStylesheet(import.meta.url, './NumberField.css'),
  googleSignIn: await readStylesheet(import.meta.url, './GoogleSignInButton.css'),
  segmentedControl: await readStylesheet(import.meta.url, './SegmentedControl.css'),
  button: await readStylesheet(import.meta.url, '../../styles/components.css'),
  summary: await readStylesheet(import.meta.url, '../../styles/base.css'),
  header: await readStylesheet(import.meta.url, './Header.css'),
  skipLink: await readStylesheet(import.meta.url, './SkipLink.css'),
  tokens: await readStylesheet(import.meta.url, '../../styles/tokens.css'),
  app: await readStylesheet(import.meta.url, '../../App.css'),
  savedLibrary: await readStylesheet(import.meta.url, './SavedLibrary.css'),
  activityPage: await readStylesheet(import.meta.url, '../pages/ActivityPage.css'),
}

/** The control height the tokens give a desktop pointer, which is the shared token's default. */
const CONTROL_PX = Number(/--control-height:\s*(\d+)px/.exec(sheets.tokens)?.[1])

/**
 * The declarations of the first rule whose selector list names `selector` exactly, so a grouped
 * rule such as `.header__tab, .header__profile` counts for both.
 */
function bodyOf(css: string, selector: string): string {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const [, selectors = '', body = ''] of bare.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (selectors.split(',').some((part) => part.trim() === selector)) return body
  }
  return ''
}

/** The `min-height` of a rule in px, the shared control height in px, or null when none is set. */
function minHeightOf(css: string, selector: string): number | null {
  const body = bodyOf(css, selector)
  if (/min-height:\s*var\(--control-height\)/.test(body)) return CONTROL_PX
  const px = /min-height:\s*(\d+)px/.exec(body)?.[1]
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

/** The controls that take the shared control height, so a phone or a finger gets 44 px for each. */
describe('the shared control height', () => {
  it.each([
    ['sign-in button', sheets.googleSignIn, '.google-sign-in'],
    ['account trigger', sheets.accountMenu, '.account-menu__trigger'],
    ['account menu item', sheets.accountMenu, '.account-menu__item'],
    ['button', sheets.button, '.btn'],
    ['skip link', sheets.skipLink, '.skip-link'],
    ['header brand', sheets.header, '.header__brand'],
    ['header tab', sheets.header, '.header__tab'],
    ['header profile link', sheets.header, '.header__profile'],
    ['link arrow', sheets.app, '.link-arrow'],
    ['file retention choice', sheets.app, '.file-retention__choice'],
    ['number field input', sheets.numberField, '.number-field__input input'],
    ['saved library delete', sheets.savedLibrary, '.saved-library__delete'],
    ['activity page back link', sheets.activityPage, '.activity-page__back'],
    ['delete dialog input', sheets.deleteDialog, '.delete-dialog__input'],
    ['disclosure summary', sheets.summary, 'summary'],
  ])('%s takes the shared control height', (_name, css, selector) => {
    expect(bodyOf(css, selector)).toMatch(/min-height:\s*var\(--control-height\)/)
  })

  it('is 40 px for a desktop pointer and 44 px on a phone or for a finger', () => {
    expect(CONTROL_PX).toBe(STANDARD_PX)
    expect(sheets.tokens).toMatch(
      /@media \(max-width: 760px\), \(pointer: coarse\) \{\s*:root \{\s*--control-height:\s*44px/,
    )
  })
})
