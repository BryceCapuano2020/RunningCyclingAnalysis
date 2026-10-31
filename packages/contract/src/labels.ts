import './zodConfig.ts'
import { z } from 'zod'
import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import type { AthleteType } from '@rca/core/types'
import { MAX_RECORD_ID_CHARS } from './limits.ts'

/** The labels an athlete can give an activity that differ from its file's sport. */
export const ATHLETE_LABELS = [
  'walk',
  'hike',
  'ski',
  'other',
] as const satisfies readonly AthleteType[]
export const AthleteLabelSchema = z.enum(ATHLETE_LABELS)

/** Most labels one PATCH /api/activities/labels request changes. */
export const MAX_LABELS_PER_REQUEST = 200

/**
 * One label change. `revision` is the model revision of the digest the client read and `from` the label
 * it read (null for none): the change applies only to a row that still holds both, so a rebuild or another
 * change in between is never overwritten. `athleteType` is the label to set, null to clear it.
 */
export const LabelChangeSchema = z.object({
  id: z.string().min(1).max(MAX_RECORD_ID_CHARS),
  revision: z.number().int().min(1),
  from: AthleteLabelSchema.nullable(),
  athleteType: AthleteLabelSchema.nullable(),
})
export type LabelChange = z.infer<typeof LabelChangeSchema>

export const ActivityLabelsSchema = z
  .object({ labels: z.array(LabelChangeSchema).min(1).max(MAX_LABELS_PER_REQUEST) })
  .superRefine(({ labels }, ctx) => {
    if (new Set(labels.map(({ id }) => id)).size !== labels.length) {
      ctx.addIssue({ code: 'custom', path: ['labels'], message: 'An activity is named twice' })
    }
    labels.forEach(({ revision }, index) => {
      if (revision > MODEL_REVISION) {
        ctx.addIssue({
          code: 'custom',
          path: ['labels', index, 'revision'],
          message: `This server supports model revisions through ${MODEL_REVISION}`,
        })
      }
    })
  })
export type ActivityLabels = z.input<typeof ActivityLabelsSchema>

/**
 * What the change did. `missed` lists the rows that no longer held the revision and label the client read,
 * with what they hold now, so the client can retry once from it. `refused` counts missed rows that did
 * still match: the account is at its digest cap, the database is full or the account is closing.
 * `skipped` counts ids that are not this account's, without saying whether they exist.
 */
export const ActivityLabelsResultSchema = z.object({
  applied: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  refused: z.number().int().nonnegative(),
  missed: z.array(
    z.object({
      id: z.string().max(MAX_RECORD_ID_CHARS),
      revision: z.number().int().min(1),
      athleteType: AthleteLabelSchema.nullable(),
    }),
  ),
})
export type ActivityLabelsResult = z.infer<typeof ActivityLabelsResultSchema>
