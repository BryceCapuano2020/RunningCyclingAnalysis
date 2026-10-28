import { z } from 'zod'
import { DISTRIBUTION_BINS, DURABILITY_AFTER_S, DURABILITY_DURATIONS_S } from '@rca/core/constants'
import type { DistributionMeasure } from '@rca/core/constants'
import { evidenceProblem } from '@rca/core/digest/evidence'
import type { EvidenceFields } from '@rca/core/digest/evidence'

/**
 * The evidence a digest keeps for the zones, durability and drift views. Shapes and bounds are here;
 * whether they agree with the rest of the digest is checked by checkEvidence, with core's own rules.
 */

const distribution = (measure: DistributionMeasure) =>
  z.object({
    offset: z.number().int().min(0).max(DISTRIBUTION_BINS[measure].maxBin),
    counts: z
      .array(z.number().int().min(0))
      .min(1)
      .max(DISTRIBUTION_BINS[measure].maxBin + 1),
  })

const durabilityPoint = z.object({
  afterS: z.number().refine((s) => DURABILITY_AFTER_S.some((a) => a === s)),
  durationS: z.number().refine((s) => DURABILITY_DURATIONS_S.some((d) => d === s)),
  value: z.number().positive(),
})

const drift = z.object({
  firstRatio: z.number().positive(),
  secondRatio: z.number().positive(),
  durationS: z.number().int().positive(),
})

/** Fields added to a digest after the first ones were stored, so older digests lack them. */
export const evidenceFields = {
  distributions: z
    .object({
      heartRate: distribution('heartRate').optional(),
      power: distribution('power').optional(),
      speed: distribution('speed').optional(),
    })
    .optional(),
  durability: z
    .array(durabilityPoint)
    .max(DURABILITY_AFTER_S.length * DURABILITY_DURATIONS_S.length)
    .optional(),
  drift: drift.nullable().optional(),
}

/** Adds an issue for evidence that disagrees with the digest it is in. */
export function checkEvidence(digest: EvidenceFields, ctx: z.RefinementCtx): void {
  const problem = evidenceProblem(digest)
  if (problem !== null) ctx.addIssue({ code: 'custom', message: problem })
}
