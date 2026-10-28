import { DRIFT } from '../constants'
import type { DigestDrift, Sport } from '../types'

/** The streams drift is read from, for one activity. Output is the main curve's stream. */
export interface DriftInput {
  sport: Sport
  output: Float64Array
  validOutput: Uint8Array
  heartRate: Float64Array
  validHeartRate: Uint8Array
  moving: Uint8Array
}

/** The means of the output and the heart rate over the usable seconds of one block. */
interface Block {
  output: number
  heartRate: number
}

/** Seconds of the activity that were moving, in order, as sample indices. */
function movingSeconds(moving: Uint8Array): Int32Array {
  let count = 0
  for (let i = 0; i < moving.length; i++) count += moving[i]!
  const indices = new Int32Array(count)
  let k = 0
  for (let i = 0; i < moving.length; i++) if (moving[i] === 1) indices[k++] = i
  return indices
}

/** The blocks of the moving seconds [from, to): null for a block with too few seconds of both streams. */
function blocksOf(
  input: DriftInput,
  seconds: Int32Array,
  from: number,
  to: number,
): (Block | null)[] {
  const blocks: (Block | null)[] = []
  for (let start = from; start + DRIFT.blockS <= to; start += DRIFT.blockS) {
    let output = 0
    let heartRate = 0
    let used = 0
    for (let k = start; k < start + DRIFT.blockS; k++) {
      const i = seconds[k]!
      const o = input.output[i]!
      const h = input.heartRate[i]!
      if (
        input.validOutput[i] === 1 &&
        input.validHeartRate[i] === 1 &&
        Number.isFinite(o) &&
        Number.isFinite(h)
      ) {
        output += o
        heartRate += h
        used++
      }
    }
    const covered = used >= DRIFT.minBlockCoverage * DRIFT.blockS
    blocks.push(covered ? { output: output / used, heartRate: heartRate / used } : null)
  }
  return blocks
}

function counted(blocks: (Block | null)[]): Block[] {
  return blocks.filter((b): b is Block => b !== null)
}

const meanOf = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length

/** Coefficient of variation: standard deviation over the mean. */
function coefficientOfVariation(xs: number[]): number {
  const mean = meanOf(xs)
  return Math.sqrt(meanOf(xs.map((x) => (x - mean) ** 2))) / mean
}

/** Output per heart rate over a half: its mean block output over its mean block heart rate. */
function ratioOf(blocks: Block[]): number {
  return meanOf(blocks.map((b) => b.output)) / meanOf(blocks.map((b) => b.heartRate))
}

/**
 * Whether an effort's output per heart rate drifted, for an effort that stayed steady; null when it
 * was not one. The first DRIFT.warmupS moving seconds are left out as warm-up, and the rest, in whole
 * blocks, is split in two halves of equal moving time. The effort qualifies when it has at least
 * DRIFT.minMovingS moving seconds, enough valid blocks in each half, a coefficient of variation of the
 * 30 s block outputs within DRIFT.maxCv for the sport, and two halves whose mean outputs are within
 * DRIFT.maxHalfGap of each other, so the change in the ratio is the heart rate's and not a change of pace.
 */
export function steadyDrift(input: DriftInput): DigestDrift | null {
  const seconds = movingSeconds(input.moving)
  if (seconds.length < DRIFT.minMovingS) return null
  const perHalf = Math.floor((seconds.length - DRIFT.warmupS) / (2 * DRIFT.blockS)) * DRIFT.blockS
  const middle = DRIFT.warmupS + perHalf
  const first = blocksOf(input, seconds, DRIFT.warmupS, middle)
  const second = blocksOf(input, seconds, middle, middle + perHalf)
  const needed = DRIFT.minHalfCoverage * (perHalf / DRIFT.blockS)
  const firstUsed = counted(first)
  const secondUsed = counted(second)
  if (firstUsed.length < needed || secondUsed.length < needed || perHalf === 0) return null
  const outputs = [...firstUsed, ...secondUsed].map((b) => b.output)
  if (!(coefficientOfVariation(outputs) <= DRIFT.maxCv[input.sport])) return null
  const firstOutput = meanOf(firstUsed.map((b) => b.output))
  const secondOutput = meanOf(secondUsed.map((b) => b.output))
  if (!(Math.abs(secondOutput - firstOutput) <= DRIFT.maxHalfGap * firstOutput)) return null
  const firstRatio = ratioOf(firstUsed)
  const secondRatio = ratioOf(secondUsed)
  if (!(firstRatio > 0 && secondRatio > 0)) return null
  return { firstRatio, secondRatio, durationS: 2 * perHalf }
}
