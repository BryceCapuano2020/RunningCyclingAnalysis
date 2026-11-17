import fc from 'fast-check'

/**
 * Property-test settings for core. The seed is fixed so a CI run is the same run every time; set FC_SEED to explore
 * another. A failure prints the seed, the path and the shrunk counterexample, so it replays with the same seed.
 */
const DEFAULT_SEED = 20_261_116

export function propertySeed(): number {
  // Core is typed without Node's globals, so the environment is read off globalThis.
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env
  const given = Number(env?.FC_SEED ?? NaN)
  return Number.isInteger(given) ? given : DEFAULT_SEED
}

/** Runs a property under the shared seed. `numRuns` stays modest: each test is one assertion over a sweep, under about 2 s. */
export function check<T>(property: fc.IProperty<T>, numRuns = 100): void {
  fc.assert(property, { seed: propertySeed(), numRuns, verbose: 1 })
}

export { fc }
