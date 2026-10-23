/** Every page's h1 has this id; the app moves focus to it when the page changes. */
export const PAGE_HEADING_ID = 'page-heading'

export function focusPageHeading() {
  document.getElementById(PAGE_HEADING_ID)?.focus()
}
