import { act } from '@testing-library/react'

/**
 * Opens every disclosure on the page, outer ones first, as a reader would. A disclosure that makes its
 * contents only while it is open (the skipped files' lists) has none of them until then.
 */
export function openDisclosures(root: ParentNode = document): void {
  for (let guard = 0; guard < 5; guard += 1) {
    const shut = Array.from(root.querySelectorAll('details:not([open])'))
    if (shut.length === 0) return
    for (const details of shut) {
      act(() => {
        details.setAttribute('open', '')
        details.dispatchEvent(new Event('toggle'))
      })
    }
  }
}
