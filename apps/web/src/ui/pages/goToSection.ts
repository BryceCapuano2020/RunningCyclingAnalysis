/**
 * Scrolls to a section, opening it first when it is a closed disclosure, and moves the keyboard there.
 * The app routes by the URL's hash, so these are buttons that scroll and not links that would change it.
 */
export function goToSection(id: string): void {
  const target = document.getElementById(id)
  if (target === null) return
  if (target instanceof HTMLDetailsElement) target.open = true
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  // The keyboard lands on something that is on screen: a closed row's summary, an open card's visible heading, or
  // else the card itself, whose chart title is its heading and whose own h2 is for a screen reader alone.
  const focusable =
    target.querySelector<HTMLElement>('summary, h2:not(.sr-only)') ?? (target as HTMLElement)
  if (focusable.tagName !== 'SUMMARY') focusable.tabIndex = -1
  focusable.focus({ preventScroll: true })
}
