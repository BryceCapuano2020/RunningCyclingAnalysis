import { AthleteLabelSchema } from '@rca/contract'

/**
 * The text of a digest that replaces a stored one, with the athlete's label kept. The label is the athlete's own
 * word, set by `PATCH /api/activities/labels`, and the original file cannot give it, so a rebuild's digest does not
 * carry it; a label set after the rebuild listed the library but before it saved would otherwise be lost. The
 * incoming digest's own label (an import that read the export's list) wins. A stored value that is not a label is
 * not carried.
 */
export function keepStoredLabel(
  storedJson: string,
  incoming: { athleteType?: unknown },
  incomingJson: string,
): string {
  if (incoming.athleteType !== undefined) return incomingJson
  try {
    const label = AthleteLabelSchema.safeParse(
      (JSON.parse(storedJson) as { athleteType?: unknown }).athleteType,
    )
    if (!label.success) return incomingJson
    return JSON.stringify({ ...(JSON.parse(incomingJson) as object), athleteType: label.data })
  } catch {
    return incomingJson
  }
}
