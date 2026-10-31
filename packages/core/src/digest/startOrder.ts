/**
 * The index of the first item that starts after `ms`, in items ordered by start; their count when none
 * does. The items that start in a window are those from the index after its start to the one after its
 * end, so a window is found, not filtered out of every item. `at` reads another key the items are ordered by
 * (the start on the week axis, `localAxisMs`).
 */
export function firstStartingAfter<T extends { startMs: number }>(
  items: readonly T[],
  ms: number,
  at: (item: T) => number = (item) => item.startMs,
): number {
  let low = 0
  let high = items.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (at(items[middle]!) <= ms) low = middle + 1
    else high = middle
  }
  return low
}
