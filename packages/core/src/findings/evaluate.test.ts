import { describe, expect, it, vi } from 'vitest'
import { evaluate, evaluateDetailed, findingId } from './evaluate'
import { inputAt } from './input'
import { registryOf } from './registry'
import { nullLibrary, plantedLibrary } from './test/plantedLibrary'
import { stubCandidate, stubDetector, WILD_HISTORY } from './test/stubs'
import type { Candidate, FindingInput } from './types'

const WEEK_MS = 7 * 86_400_000
const library = nullLibrary({ seed: 1, weeks: 30, perWeek: 2 })
const both = plantedLibrary({
  seed: 1,
  weeks: 30,
  perWeek: 4,
  noise: 0.02,
  effects: [],
  sports: ['run', 'ride'],
})

type Make = (input: FindingInput) => Candidate[]

/** Evaluates what the stub says on the library's last week, as a pattern detector. */
function evaluateStub(make: Make, options = {}) {
  const registry = registryOf([stubDetector('stub', { kind: 'pattern', says: make })])
  return evaluateDetailed(inputAt(library), { registry, ...options })
}

const confidenceOf = (share: number) => ({
  sign: { kind: 'agree' as const, share },
  n: 10,
  nNeeded: 10,
  robust: true,
})

describe('evaluate', () => {
  it('names a finding detector:sports:subject and carries what the candidate and detector say', () => {
    const input = inputAt(library)
    const [finding] = evaluateStub((i) => [stubCandidate({}, i)]).findings
    expect(finding!.id).toBe('stub:run:thing')
    expect(finding).toMatchObject({
      detector: 'stub',
      kind: 'pattern',
      sports: ['run'],
      confidence: 1,
      surprise: 1,
      score: 1,
      corroboratedBy: [],
      asOfMs: input.asOfMs,
      firstSeenMs: input.asOfMs,
    })
    expect(finding!.fingerprint).toBe('stub:run:thing|1|-7')
    expect(findingId('x', ['run', 'ride'], 's')).toBe('x:ride+run:s')
  })

  it('drops what does not clear 0.80 confidence and 0.40 surprise, and says why', () => {
    const noise = WILD_HISTORY.noise
    const result = evaluateStub((i) => [
      stubCandidate({}, i),
      stubCandidate({ subject: 'weak', support: confidenceOf(0.89) }, i),
      // 2 spreads from usual: not far enough out of the ordinary, whatever its rarity
      stubCandidate(
        { subject: 'dull', surprise: { effect: 2 * 1.4826, noise, past: WILD_HISTORY.past } },
        i,
      ),
    ])
    expect(result.findings.map((f) => f.id)).toEqual(['stub:run:thing'])
    expect(result.rejected).toEqual([
      { id: 'stub:run:weak', reason: 'confidence' },
      { id: 'stub:run:dull', reason: 'surprise' },
    ])
  })

  it('drops banned wording anywhere a finding carries it, as a defect', () => {
    const result = evaluateStub((i) => [
      stubCandidate({ subject: 'headline', headline: 'Climbing is your limiter.' }, i),
      stubCandidate(
        {
          subject: 'cause',
          likelyCause: { text: 'It happened because you ran more.', signals: [] },
        },
        i,
      ),
      stubCandidate(
        { subject: 'method', method: { test: 'due to rest', n: 1, exclusions: [] } },
        i,
      ),
      stubCandidate(
        { subject: 'unit', numbers: [{ key: 'k', value: 1, unit: 'ahead of plan' }] },
        i,
      ),
    ])
    expect(result.findings).toEqual([])
    expect(result.rejected.map((r) => r.reason)).toEqual(['copy', 'copy', 'copy', 'copy'])
  })

  it('drops malformed candidates as defects: numbers, intervals, dates, evidence and sign', () => {
    const defects: Record<string, (i: FindingInput) => Partial<Candidate>> = {
      nan: () => ({ effect: Number.NaN }),
      blank: () => ({ headline: '' }),
      nonumber: () => ({ numbers: [{ key: 'k', value: Number.NaN, unit: '' }] }),
      nanLow: () => ({ numbers: [{ key: 'k', value: 1, unit: '', low: Number.NaN, high: 2 }] }),
      nanHigh: () => ({ numbers: [{ key: 'k', value: 1, unit: '', low: 0, high: Number.NaN }] }),
      future: (i) => ({ asOfMs: i.asOfMs + 1 }),
      windowAhead: (i) => ({
        window: { fromMs: i.asOfMs - WEEK_MS, toMs: i.asOfMs + 8 * 86_400_000 },
      }),
      backwards: (i) => ({ baseline: { fromMs: i.asOfMs, toMs: i.asOfMs - WEEK_MS } }),
      stranger: () => ({ evidence: [{ type: 'activity', id: 'not-in-the-library' }] }),
      wrongSign: () => ({
        effect: -0.05,
        support: { sign: { kind: 'z', z: 3 }, n: 10, nNeeded: 10, robust: true },
      }),
      nanZ: () => ({
        support: { sign: { kind: 'z', z: Number.NaN }, n: 10, nNeeded: 10, robust: true },
      }),
      lessThanFlip: () => ({ support: confidenceOf(0.3) }),
    }
    const result = evaluateStub((i) =>
      Object.entries(defects).map(([subject, over]) => stubCandidate({ subject, ...over(i) }, i)),
    )
    expect(result.findings).toEqual([])
    expect(result.rejected.map((r) => r.reason)).toEqual(Object.keys(defects).map(() => 'invalid'))
  })

  it("accepts evidence in the library, a window that ends with the week, and a z of the effect's sign", () => {
    const result = evaluateStub((i) => [
      stubCandidate(
        {
          evidence: [{ type: 'activity', id: i.digests[3]!.id }],
          window: { fromMs: i.asOfMs - WEEK_MS, toMs: i.asOfMs },
          effect: -0.05,
          support: { sign: { kind: 'z', z: -3, degrees: 8 }, n: 10, nNeeded: 10, robust: true },
        },
        i,
      ),
    ])
    expect(result.rejected).toEqual([])
    expect(result.findings).toHaveLength(1)
  })

  it('drops a candidate about a time long gone as stale, which is not a defect', () => {
    const result = evaluateStub((i) => [
      stubCandidate({ subject: 'old', asOfMs: i.asOfMs - 9 * WEEK_MS }, i),
      stubCandidate({ subject: 'recent', asOfMs: i.asOfMs - 7 * WEEK_MS }, i),
    ])
    expect(result.rejected).toEqual([{ id: 'stub:run:old', reason: 'stale' }])
    expect(result.findings.map((f) => f.id)).toEqual(['stub:run:recent'])
  })

  it('runs a detector only for its sports and only with its minimum history in that sport', () => {
    const says = vi.fn((i: FindingInput) => [stubCandidate({}, i)])
    const input = inputAt(library)
    evaluate(input, {
      registry: registryOf([stubDetector('late', { minHistoryWeeks: 100, says })]),
    })
    evaluate(input, {
      registry: registryOf([stubDetector('ride-only', { sports: ['ride'], says })]),
    })
    expect(says).not.toHaveBeenCalled()
    evaluate(input, { registry: registryOf([stubDetector('now', { minHistoryWeeks: 25, says })]) })
    expect(says).toHaveBeenCalledTimes(1)
  })

  describe("a finding both sports' runs make", () => {
    const run = (make: (sport: string, i: FindingInput) => Candidate) =>
      evaluate(inputAt(both), {
        registry: registryOf([
          stubDetector('both', {
            sports: ['run', 'ride'],
            says: (i, sport) => [make(sport, i)],
          }),
        ]),
      })

    it('is kept once, at its higher score', () => {
      const found = run((sport, i) =>
        stubCandidate(
          { sports: ['run', 'ride'], support: confidenceOf(sport === 'run' ? 0.95 : 1) },
          i,
        ),
      )
      expect(found.map((f) => f.id)).toEqual(['both:ride+run:thing'])
      expect(found[0]!.confidence).toBe(1)
    })

    it('is kept from the run that clears the bar, whatever the score of the one that does not', () => {
      const found = run((sport, i) =>
        sport === 'run'
          ? stubCandidate({ sports: ['run', 'ride'], headline: 'Your limiter is the hills.' }, i)
          : stubCandidate({ sports: ['run', 'ride'], support: confidenceOf(0.95) }, i),
      )
      expect(found).toHaveLength(1)
      expect(found[0]!.confidence).toBeCloseTo(0.9, 12)
      // And the other way round, with the clean one first.
      const first = run((sport, i) =>
        sport === 'ride'
          ? stubCandidate({ sports: ['run', 'ride'], headline: 'Your limiter is the hills.' }, i)
          : stubCandidate({ sports: ['run', 'ride'], support: confidenceOf(0.95) }, i),
      )
      expect(first).toHaveLength(1)
    })
  })

  describe('memory of earlier evaluations', () => {
    const input = inputAt(library)
    const registry = registryOf([stubDetector('stub', { kind: 'pattern' })])
    const earlier = input.asOfMs - 2 * WEEK_MS

    it('ranks a finding shown before lower, and a reversal higher, without changing whether they clear the bar', () => {
      const same = evaluate(input, {
        registry,
        shown: [{ id: 'stub:run:thing', sign: 1, atMs: earlier }],
      })
      expect(same[0]!.surprise).toBeCloseTo(0.4, 12)
      expect(same[0]!.score).toBeCloseTo(0.4, 12)
      const flipped = evaluate(input, {
        registry,
        shown: [{ id: 'stub:run:thing', sign: -1, atMs: earlier }],
      })
      expect(flipped[0]!.surprise).toBe(1)
    })

    it("does not let a reversal's lift get a finding over the bar", () => {
      // Far enough out (2.5 spreads) but a short history with the cap of 0.6 and then 1.25 x 0.5: it is
      // judged on 0.5 before lifting, so it clears on its own merits, and one that is too dull does not.
      const dull = (i: FindingInput) => [
        stubCandidate(
          {
            surprise: { effect: 1.5 * 1.4826, noise: WILD_HISTORY.noise, past: WILD_HISTORY.past },
          },
          i,
        ),
      ]
      const reg = registryOf([stubDetector('stub', { kind: 'pattern', says: dull })])
      const shown = [{ id: 'stub:run:thing', sign: -1 as const, atMs: earlier }]
      expect(evaluateDetailed(input, { registry: reg, shown }).rejected).toEqual([
        { id: 'stub:run:thing', reason: 'surprise' },
      ])
    })

    it('lets a finding being spoken stay on the plain surprise down to 0.25', () => {
      // 1.5 spreads from usual with a rarity of 0.5: the formula says 0.5, the start needs 2.5 spreads.
      const past = [
        ...Array.from({ length: 20 }, () => 0.1),
        ...Array.from({ length: 20 }, () => 4),
      ]
      const middling = (i: FindingInput) => [
        stubCandidate({ surprise: { effect: 1.5 * 1.4826, noise: WILD_HISTORY.noise, past } }, i),
      ]
      const reg = registryOf([stubDetector('stub', { kind: 'pattern', says: middling })])
      expect(evaluate(input, { registry: reg })).toEqual([])
      const holding = new Map([['stub:run:thing', 1]])
      expect(evaluate(input, { registry: reg, holding })).toHaveLength(1)
      expect(
        evaluate(input, { registry: reg, holding: new Map([['stub:run:thing', -1]]) }),
      ).toEqual([])
    })
  })

  it('ranks by confidence times surprise', () => {
    const found = evaluateStub((i) => [
      stubCandidate({ subject: 'half', support: confidenceOf(0.95) }, i),
      stubCandidate({}, i),
    ]).findings
    expect(found.map((f) => f.id)).toEqual(['stub:run:thing', 'stub:run:half'])
    expect(found[1]!.score).toBeCloseTo(0.9, 12)
  })

  it('does not depend on the order of the digests, the clock or the period', () => {
    const now = vi.spyOn(Date, 'now')
    const registry = registryOf([
      stubDetector('seen', {
        says: (input) => [
          stubCandidate({ numbers: [{ key: 'n', value: input.digests.length, unit: '' }] }, input),
        ],
      }),
    ])
    const reversed = { ...library, digests: [...library.digests].reverse() }
    const a = evaluate(inputAt(library), { registry })
    expect(evaluate(inputAt(reversed), { registry })).toEqual(a)
    expect(a[0]!.numbers[0]!.value).toBe(library.digests.length)
    expect(now).not.toHaveBeenCalled()
    now.mockRestore()
  })
})
