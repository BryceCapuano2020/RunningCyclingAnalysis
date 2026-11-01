import { it, vi } from 'vitest'
import type { Draw, Arm } from './arms'
import { runArm, wilson } from './arms'
import type { LibraryKind, LibraryOptions } from './libraries'
import type { Sport } from '../../types'

/**
 * The effort gate's synthetic harness, shared by the gate.*.sim.test.ts files: 100 athletes an arm (critical power, work
 * capacity, maximum heart rate and its slope varied), twelve weeks of runs unless the arm says otherwise, drawn by the
 * generator and read through the whole analysis. An arm says who the athletes are, what they train, and whether the settings
 * give the year of birth or an entered maximum. Every claim is a Wilson 95% bound on a count out of 100; the recorded counts
 * are in docs/design/effort-gate.md. The harness is synthetic: heart rate follows power in a straight line, so what it says of
 * hard and tempo efforts is about this model. The files are split only to run side by side: each arm is drawn from seeds 1
 * to 100, the same whichever file draws it.
 */
export const N = 100

/** The sim run's per-test limit for the arms a test draws (the config's is for a file of fewer). */
export function allowLongArms(): void {
  vi.setConfig({ testTimeout: 900_000 })
}

export const train = (
  kind: LibraryKind,
  over: Partial<Arm> = {},
  options: LibraryOptions = {},
  sport: Sport = 'run',
): Arm => ({ training: [{ kind, sport, options }], ...over })

/** Realistic easy running: 70% to 80% of maximum heart rate, with strides on three days in ten. */
export const REAL_EASY: LibraryOptions = { easyShare: [0.7, 0.8], strides: 0.3 }

/** The draws of an arm, once per arm in a file: an arm is its own key, so a name never draws it twice. */
const cache = new Map<string, Draw[]>()
const named = new Map<string, { key: string; sport: Sport }>()
export function draws(name: string, arm: Arm): Draw[] {
  const key = JSON.stringify(arm)
  let found = cache.get(key)
  if (found === undefined) {
    found = runArm(arm, N)
    cache.set(key, found)
  }
  named.set(name, { key, sport: arm.training[0]!.sport })
  return found
}

/** How many of an arm's athletes the gate calls `verdict`, with the Wilson bound on the share. */
export function count(name: string, arm: Arm, verdict: string) {
  const sport = arm.training[0]!.sport
  const n = draws(name, arm).filter((d) => d.result.effortGate[sport].verdict === verdict).length
  const [low, high] = wilson(n, N)
  return { n, low, high }
}

export const HARD_BOUNDS = 'lower 95% bound on the share let through'

/** With RECORD set, prints the verdicts of every arm the file drew, for the table in docs/design/effort-gate.md. */
export function recordArms(): void {
  const recording = (globalThis as { process?: { env: Record<string, string | undefined> } })
    .process?.env.RECORD
  it.skipIf(recording === undefined)('prints the verdicts of every arm run above', () => {
    const lines = [...named.entries()].map(([name, { key, sport }]) => {
      const verdicts: Record<string, number> = {}
      const readings: Record<string, number> = {}
      for (const d of cache.get(key) ?? []) {
        const gate = d.result.effortGate[sport]
        verdicts[gate.verdict] = (verdicts[gate.verdict] ?? 0) + 1
        readings[String(gate.reference)] = (readings[String(gate.reference)] ?? 0) + 1
      }
      return `${name}: ${JSON.stringify(verdicts)} ${JSON.stringify(readings)}`
    })
    console.log(`RECORDED\n${lines.join('\n')}`)
  })
}
