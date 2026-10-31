import {
  MAX_DIGEST_FLAG_MESSAGE_BYTES,
  MAX_DIGEST_ID_BYTES,
  MAX_DIGEST_NAME_BYTES,
  MAX_DIGEST_SESSION_KEY_BYTES,
} from '@rca/contract'
import type { ActivityDigest } from '@rca/core/types'
import { HttpError } from '../../errors.ts'

const encoder = new TextEncoder()
const bytes = (text: string) => encoder.encode(text).byteLength

/**
 * Refuses a digest whose free text is longer than a real activity's: the name, id, session key and each flag message
 * each have a byte cap (see MAX_DIGEST_NAME_BYTES). The digest budget bounds the whole digest; this bounds one string.
 */
export function checkDigestText(digest: ActivityDigest): void {
  const tooLong =
    bytes(digest.name) > MAX_DIGEST_NAME_BYTES ||
    bytes(digest.id) > MAX_DIGEST_ID_BYTES ||
    (digest.sessionKey !== undefined && bytes(digest.sessionKey) > MAX_DIGEST_SESSION_KEY_BYTES) ||
    digest.flags.some((flag) => bytes(flag.message) > MAX_DIGEST_FLAG_MESSAGE_BYTES)
  if (tooLong) {
    throw new HttpError(413, 'text_too_long', 'A name or note in this activity is too long')
  }
}
