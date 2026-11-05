/** Text as a reader sees it: runs of white space, a no-break space among them, as one space, and no space at the ends. */
const normal = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim()

/**
 * A text matcher for the element whose whole text is `text`, however it is split across its children (a figure and its
 * smaller unit), and not for the elements that hold it.
 */
export function wholeText(text: string) {
  return (_: string, element: Element | null): boolean =>
    element !== null &&
    normal(element.textContent) === text &&
    Array.from(element.children).every((child) => normal(child.textContent) !== text)
}
