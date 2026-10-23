/**
 * Pairs each item with a React key built from its content, so a key stays with its item when the
 * list changes order. Items with equal content get a running count, which keeps every key unique.
 */
export function keyByContent<T>(
  items: readonly T[],
  contentOf: (item: T) => string,
): { key: string; item: T; index: number }[] {
  const seen = new Map<string, number>()
  return items.map((item, index) => {
    const content = contentOf(item)
    const count = seen.get(content) ?? 0
    seen.set(content, count + 1)
    return { key: `${content}#${count}`, item, index }
  })
}
