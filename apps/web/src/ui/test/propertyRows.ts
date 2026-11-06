/** The value of the detail-panel row labelled `label` inside `scope`, or null when the panel has no such row. */
export function rowValue(scope: ParentNode, label: string): string | null {
  for (const term of Array.from(scope.querySelectorAll('.props__row > dt'))) {
    if (term.textContent === label) return term.nextElementSibling?.textContent ?? null
  }
  return null
}

/** Every row of the detail panels inside `scope`, as [label, value] pairs in page order. */
export function rowsIn(scope: ParentNode): [string, string][] {
  return Array.from(scope.querySelectorAll('.props__row')).map((row) => [
    row.children[0]?.textContent ?? '',
    row.children[1]?.textContent ?? '',
  ])
}
