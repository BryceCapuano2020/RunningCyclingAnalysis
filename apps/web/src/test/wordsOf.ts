/**
 * The words on a page, as a reader meets them on opening it: not a drawing's own labels, a definition's note (one press
 * away), screen-reader text, or what a closed disclosure holds beyond its summary. The first-screen word budgets count with it.
 */
export function wordsOf(container: HTMLElement): string[] {
  const clone = container.cloneNode(true) as HTMLElement
  clone
    .querySelectorAll(
      'svg, script, style, [hidden], .sr-only, .definition__note, dialog:not([open])',
    )
    .forEach((node) => node.remove())
  clone.querySelectorAll('details:not([open])').forEach((details) => {
    for (const child of [...details.children]) if (child.tagName !== 'SUMMARY') child.remove()
  })
  return (clone.textContent ?? '').split(/\s+/).filter((word) => word !== '')
}
