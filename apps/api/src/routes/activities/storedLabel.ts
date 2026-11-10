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

/**
 * The text of a digest that replaces a stored one, with the name the athlete gave the activity. The name is set by
 * `PATCH /api/activities/:id/name` and kept in the row's `name_override`; the original file cannot give it, so a
 * rebuilt or re-imported digest of the same file carries the file's name and this puts the athlete's back.
 * Without an override the digest is returned as it is.
 */
export function keepStoredName(nameOverride: string | null, incomingJson: string): string {
  if (nameOverride === null) return incomingJson
  try {
    return JSON.stringify({ ...(JSON.parse(incomingJson) as object), name: nameOverride })
  } catch {
    return incomingJson
  }
}
