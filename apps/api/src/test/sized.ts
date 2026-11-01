import { ActivityDigestSchema } from '@rca/contract'
import { digestFixture } from './harness.ts'

/** Bytes the server stores for a digest: the JSON it re-serialises after parsing. */
export function storedBytes(overrides: Record<string, unknown> = {}): number {
  const wire = JSON.parse(JSON.stringify(digestFixture(overrides)))
  return new TextEncoder().encode(JSON.stringify(ActivityDigestSchema.parse(wire))).byteLength
}

/**
 * Overrides that make a digest about `bytes` larger: climb sections and heart-rate blocks, which a week-long activity may
 * hold thousands of. The free text of a digest is capped (a name, an id, a flag message), so it can no longer be padded
 * to size.
 */
export function bulk(bytes: number): Record<string, unknown> {
  const section = {
    start: 0,
    end: 1,
    measuredW: 250,
    terms: { gravityAccel: 1.5, rolling: 0.2, aero: 0.3 },
  }
  const block = { heartRate: 150, value: 210, terms: null }
  const eachSection = JSON.stringify(section).length + 1
  const eachBlock = JSON.stringify(block).length + 1
  const sections = Math.min(2000, Math.floor(bytes / eachSection))
  const blocks = Math.min(2000, Math.floor((bytes - sections * eachSection) / eachBlock))
  return {
    durationS: 604_800,
    climbSections: Array.from({ length: sections }, () => section),
    hrBlocks: Array.from({ length: Math.max(1, blocks) }, () => block),
  }
}

/**
 * Overrides, and the length of a name, that make the stored digest exactly `target` bytes: bulk first, then the name
 * for the last few dozen bytes.
 */
export function sizedTo(target: number): {
  overrides: Record<string, unknown>
  nameLength: number
} {
  const rough = bulk(target - storedBytes({ durationS: 604_800 }) - 200)
  const nameLength = target - storedBytes({ ...rough, name: '' })
  if (nameLength < 0 || nameLength > 1000) throw new Error(`cannot size a digest to ${target}`)
  return { overrides: rough, nameLength }
}
