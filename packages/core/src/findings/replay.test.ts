import { describe, expect, it } from 'vitest'
import type { Candidate, FindingInput } from './types'
import { inputAt, weeklyMarks } from './input'
import { registryOf } from './registry'
import { replay } from './replay'
import { selectFindings } from './select'
import { nullLibrary } from './test/plantedLibrary'
import { stubCandidate, stubDetector, WILD_HISTORY } from './test/stubs'

const library = nullLibrary({ seed: 1, weeks: 30, perWeek: 2 })
const marks = weeklyMarks(library.digests)

/** A history that is 1.5 spreads out with a rarity of one half: surprise 0.5, but not far enough out to start. */
const MIDDLING = {
  effect: 1.5 * 1.4826,
  noise: WILD_HISTORY.noise,
  past: [...Array.from({ length: 20 }, () => 0.1), ...Array.from({ length: 20 }, () => 4)],
}

const confident = (share: number) => ({
  sign: { kind: 'agree' as const, share },
  n: 10,
  nNeeded: 10,
  robust: true,
})

/** A detector that speaks at the marks with these indices, with the sign given for each. */
function speaksAt(
  signs: Record<number, 1 | -1>,
  over: (index: number) => Partial<Candidate> = () => ({}),
) {
  return registryOf([
    stubDetector('stub', {
      says: (input: FindingInput) => {
        const index = marks.indexOf(input.asOfMs)
        const sign = signs[index]
        return sign === undefined
          ? []
          : [stubCandidate({ effect: 0.05 * sign, ...over(index) }, input)]
      },
    }),
  ])
}

const spokenAt = (signs: Record<number, 1 | -1>, over?: (index: number) => Partial<Candidate>) =>
  replay(library, marks, { registry: speaksAt(signs, over) }).marks.flatMap((m, i) =>
    m.spoken.length > 0 ? [i] : [],
  )

describe('replay', () => {
  it('speaks a finding only from the second evaluation in a row that clears the bar', () => {
    expect(spokenAt({ 10: 1, 11: 1, 12: 1 })).toEqual([11, 12])
    expect(spokenAt({ 10: 1 })).toEqual([])
  })

  it('does not start across a gap: a finding that flickers on is not spoken until it holds', () => {
    expect(spokenAt({ 10: 1, 12: 1, 13: 1 })).toEqual([13])
  })

  it('does not speak across a flip of sign, and speaks again when the new sign holds', () => {
    expect(spokenAt({ 10: 1, 11: -1, 12: -1 })).toEqual([12])
  })

  it('lets a spoken finding miss one evaluation without ending its run, and two end it', () => {
    expect(spokenAt({ 10: 1, 11: 1, 12: 1, 14: 1 })).toEqual([11, 12, 14])
    expect(spokenAt({ 10: 1, 11: 1, 15: 1, 16: 1 })).toEqual([11, 16])
    const grace = replay(library, marks.slice(0, 16), {
      registry: speaksAt({ 10: 1, 11: 1, 12: 1, 14: 1, 15: 1 }),
    })
    expect(grace.findings[0]!.firstSeenMs).toBe(marks[11])
    const ended = replay(library, marks.slice(0, 18), {
      registry: speaksAt({ 10: 1, 11: 1, 15: 1, 16: 1, 17: 1 }),
    })
    expect(ended.findings[0]!.firstSeenMs).toBe(marks[16])
  })

  it('stamps firstSeenMs with the first mark it was spoken at in its current run', () => {
    const result = replay(library, marks.slice(0, 15), {
      registry: speaksAt({ 10: 1, 11: 1, 12: 1, 13: 1, 14: 1 }),
    })
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]!.firstSeenMs).toBe(marks[11])
    // Missing one evaluation does not end the run, so it is still the one begun at 9.
    const bridged = replay(library, marks.slice(0, 16), {
      registry: speaksAt({ 8: 1, 9: 1, 10: 1, 12: 1, 13: 1, 14: 1, 15: 1 }),
    })
    expect(bridged.findings[0]!.firstSeenMs).toBe(marks[9])
    // Missing two does.
    const restarted = replay(library, marks.slice(0, 16), {
      registry: speaksAt({ 8: 1, 9: 1, 10: 1, 13: 1, 14: 1, 15: 1 }),
    })
    expect(restarted.findings[0]!.firstSeenMs).toBe(marks[14])
  })

  it('lets a finding being spoken go on at the lower floor of surprise, and one that never started stay silent', () => {
    // 10 and 11 are far out of the ordinary; 12 to 15 are only middling (0.5, 1.5 spreads out).
    const middlingAfter = (index: number) => (index >= 12 ? { surprise: MIDDLING } : {})
    expect(spokenAt({ 10: 1, 11: 1, 12: 1, 13: 1, 14: 1, 15: 1 }, middlingAfter)).toEqual([
      11, 12, 13, 14, 15,
    ])
    // Without having started, the same middling findings never clear the bar.
    expect(spokenAt({ 12: 1, 13: 1, 14: 1, 15: 1 }, () => ({ surprise: MIDDLING }))).toEqual([])
  })

  it('ranks a finding that goes on lower, without dropping it, and a reversal higher', () => {
    const result = replay(library, marks.slice(0, 16), {
      registry: speaksAt({ 10: 1, 11: 1, 12: 1, 13: 1 }),
    })
    const surprises = result.marks.map((m) => m.spoken[0]?.surprise)
    expect(surprises.slice(11, 14)).toEqual([1, expect.closeTo(0.4, 12), expect.closeTo(0.4, 12)])
    expect(result.marks[13]!.spoken).toHaveLength(1)
    const flip = replay(library, marks, {
      registry: speaksAt({ 10: 1, 11: 1, 12: 1, 13: -1, 14: -1 }),
    })
    expect(flip.marks.map((m) => m.spoken.length > 0).slice(10, 16)).toEqual([
      false,
      true,
      true,
      false,
      true,
      false,
    ])
    expect(flip.marks[14]!.spoken[0]!.surprise).toBe(1)
  })

  it('counts as shown only what survives grouping and the caps, so a finding grouped away is not damped', () => {
    // Two efficiency findings of the run say the same thing, from the same mark; the better one is shown
    // and the other is named as its corroboration. It was spoken but never shown, so it is not damped,
    // and when the shown one has been damped it is the one that leads.
    const registry = registryOf([
      stubDetector('lead', {
        says: (input) =>
          marks.indexOf(input.asOfMs) >= 8 ? [stubCandidate({ subject: 'a' }, input)] : [],
      }),
      stubDetector('second', {
        says: (input) =>
          marks.indexOf(input.asOfMs) >= 8
            ? [stubCandidate({ subject: 'b', support: confident(0.95) }, input)]
            : [],
      }),
    ])
    const result = replay(library, marks.slice(0, 14), { registry })
    expect(result.marks[9]!.spoken.map((f) => f.id).sort()).toEqual(['lead:run:a', 'second:run:b'])
    expect(result.marks[9]!.shown.map((f) => f.id)).toEqual(['lead:run:a'])
    expect(result.marks[9]!.shown[0]!.corroboratedBy).toEqual(['second:run:b'])
    // Next week the first has been shown, so it ranks at 0.4; the second never was, so it ranks at 0.9 x 1.
    const next = result.marks[10]!.shown
    expect(next.map((f) => f.id)).toEqual(['second:run:b'])
    expect(next[0]!.surprise).toBe(1)
    expect(next[0]!.corroboratedBy).toEqual(['lead:run:a'])
    // And it is damped from then on, like any other.
    expect(result.marks[11]!.shown[0]!.surprise).toBeCloseTo(0.4, 12)
  })

  it('shows each evaluation only the data up to its mark', () => {
    const seen: number[] = []
    const registry = registryOf([
      stubDetector('probe', {
        says: (input) => {
          expect(input.digests.every((d) => d.startMs <= input.asOfMs)).toBe(true)
          expect(input.tables.weeklyMoving.run.at(-1)!.endMs).toBeGreaterThanOrEqual(
            input.asOfMs - 6 * 86_400_000,
          )
          seen.push(input.digests.length)
          return []
        },
      }),
    ])
    replay(library, marks, { registry })
    expect(seen).toHaveLength(marks.length)
    expect(seen).toEqual([...seen].sort((a, b) => a - b))
    expect(seen.at(-1)).toBe(library.digests.length)
  })

  it('gives the same result for the same library, however the digests and marks arrive, and as it goes on', () => {
    const registry = speaksAt({ 10: 1, 11: 1, 12: 1 })
    const full = replay(library, marks, { registry })
    const shuffled = replay(
      { ...library, digests: [...library.digests].reverse() },
      [...marks, ...marks].reverse(),
      { registry },
    )
    expect(shuffled).toEqual(full)
    for (const k of [11, 12, 15]) {
      const prefix = replay(library, marks.slice(0, k + 1), { registry })
      expect(prefix.findings).toEqual(selectFindings(full.marks[k]!.spoken))
      expect(prefix.marks).toEqual(full.marks.slice(0, k + 1))
    }
  })

  it('takes the input from the caller when it has it already', () => {
    const calls: number[] = []
    const registry = speaksAt({ 10: 1, 11: 1 })
    const result = replay(library, marks.slice(0, 12), {
      registry,
      inputAt: (asOfMs) => {
        calls.push(asOfMs)
        return inputAt(library, asOfMs)
      },
    })
    expect(calls).toEqual(marks.slice(0, 12))
    expect(result.marks[11]!.spoken).toHaveLength(1)
  })

  it('reports what cleared the bar and what was rejected at each mark, and is empty without marks', () => {
    const result = replay(library, marks.slice(0, 13), {
      registry: registryOf([
        stubDetector('stub', {
          says: (input) =>
            marks.indexOf(input.asOfMs) === 12
              ? [
                  stubCandidate({}, input),
                  stubCandidate({ subject: 'rude', headline: 'Your limiter' }, input),
                ]
              : [],
        }),
      ]),
    })
    expect(result.marks[12]!.passed).toEqual(['stub:run:thing'])
    expect(result.marks[12]!.rejected).toEqual([{ id: 'stub:run:rude', reason: 'copy' }])
    expect(replay(library, [], { registry: speaksAt({}) })).toEqual({ findings: [], marks: [] })
    expect(inputAt(library, marks[0]).asOfMs).toBe(marks[0])
  })
})
