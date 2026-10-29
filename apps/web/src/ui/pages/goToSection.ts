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
  const focusable = target.querySelector<HTMLElement>('summary, h2')
  if (focusable !== null) {
    if (focusable.tagName === 'H2') focusable.tabIndex = -1
    focusable.focus({ preventScroll: true })
  }
}
