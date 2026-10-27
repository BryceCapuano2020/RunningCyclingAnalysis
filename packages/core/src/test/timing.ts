/** The fastest of seven timed calls, ms, so neither the cold first call nor a stray pause counts. */
export function fastestMs(run: () => void): number {
  let fastest = Infinity
  for (let i = 0; i < 7; i++) {
    const start = performance.now()
    run()
    fastest = Math.min(fastest, performance.now() - start)
  }
  return fastest
}
