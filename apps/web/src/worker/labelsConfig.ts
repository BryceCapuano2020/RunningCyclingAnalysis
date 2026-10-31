/**
 * Whether an import of an export applies the list's types to the workouts the account already holds, labelling those
 * the athlete called Hike, Walk or another type (D12 section 2.4). Off until the labels endpoint has been run against
 * remote D1 (docs/PRODUCTION.md, the pre-client checklist): nothing sends a label before then. Revision 7 is written
 * and the digest of a new import carries the label its own file's list type gives; this switch is only about the
 * workouts the account already holds.
 */
export const ATHLETE_LABELS_ENABLED = false
