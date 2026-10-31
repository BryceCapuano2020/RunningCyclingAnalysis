import { currentRevision } from './revisions'

/** Revision of the analysis model encoded by each stored activity digest: the last one declared in `REVISIONS`. */
export const MODEL_REVISION = currentRevision()

/** The version of the digest's wire format. A digest of another version is not read. */
export const DIGEST_VERSION = 1
