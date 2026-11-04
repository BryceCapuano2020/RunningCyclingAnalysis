/** A workflow's jobs, each as its lines, keyed by job id (the two-space keys under `jobs:`). */
export function jobBlocks(source) {
  const lines = source.split('\n')
  const blocks = new Map()
  let current = null
  for (const line of lines.slice(lines.indexOf('jobs:') + 1)) {
    const job = /^ {2}([A-Za-z0-9_-]+):$/.exec(line)
    if (job) {
      current = job[1]
      blocks.set(current, [])
    } else if (current) {
      blocks.get(current).push(line)
    }
  }
  return blocks
}
