import { act } from '@testing-library/react'
import { DETAIL_TERM } from '../pages/ThresholdBasis'

/**
 * Opens a threshold's "Details" disclosure inside `scope`, as a press on its summary does, and returns
 * the summary, which is named for its threshold. Throws when there is none, or more than one.
 */
export function openDetail(scope: ParentNode = document): HTMLElement {
  const summaries = Array.from(scope.querySelectorAll('details > summary')).filter((summary) =>
    summary.textContent?.startsWith(DETAIL_TERM),
  )
  if (summaries.length !== 1) throw new Error(`expected one detail, found ${summaries.length}`)
  const summary = summaries[0] as HTMLElement
  const details = summary.parentElement as HTMLDetailsElement
  act(() => {
    details.open = true
    details.dispatchEvent(new Event('toggle'))
  })
  return summary
}

/** The threshold details' summaries inside `scope`, by their text. */
export function detailSummaries(scope: ParentNode = document): string[] {
  return Array.from(scope.querySelectorAll('details > summary'))
    .map((summary) => summary.textContent ?? '')
    .filter((text) => text.startsWith(DETAIL_TERM))
}
