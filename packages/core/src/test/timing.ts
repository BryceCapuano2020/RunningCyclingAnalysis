/** The fastest of `runs` timed calls, ms, so neither the cold first call nor a stray pause counts. */
export function fastestMs(run: () => void, runs = 7): number {
  let fastest = Infinity
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    run()
    fastest = Math.min(fastest, performance.now() - start)
  }
  return fastest
}
