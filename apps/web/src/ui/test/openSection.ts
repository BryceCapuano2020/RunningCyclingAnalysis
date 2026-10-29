import { fireEvent, screen } from '@testing-library/react'

/**
 * Opens a closed section of a sport page by its name, as a press on its summary does, and returns its region.
 * The section mounts its content the first time it opens, so a test that reads inside it opens it first.
 */
export function openSection(name: string | RegExp): HTMLElement {
  const region = screen.getByRole('region', { name })
  const details = region.querySelector('details')
  if (details === null) throw new Error('the section is not a disclosure')
  details.open = true
  fireEvent(details, new Event('toggle'))
  return region
}

/** What a closed section's row says: its name and its finding. */
export function closedRow(name: string | RegExp): string {
  const summary = screen.getByRole('region', { name }).querySelector('summary')
  return summary?.textContent ?? ''
}
