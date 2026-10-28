export interface Range {
  start: number
  end: number
}

/** Maximal runs of consecutive indices in [0, n) for which pred holds. */
export function runsWhere(n: number, pred: (i: number) => boolean): Range[] {
  const runs: Range[] = []
  let i = 0
  while (i < n) {
    if (!pred(i)) {
      i++
      continue
    }
    const start = i
    while (i < n && pred(i)) i++
    runs.push({ start, end: i })
  }
  return runs
}
