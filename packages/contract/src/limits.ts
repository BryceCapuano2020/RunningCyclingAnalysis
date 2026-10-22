/** Largest JSON digest accepted by POST /api/activities, in bytes. */
export const MAX_DIGEST_BYTES = 256 * 1024

/** Largest original file accepted by PUT /api/activities/:id/file, in bytes. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024

/** Every non-GET /api request must send this header with the value below (CSRF defence). */
export const CLIENT_HEADER = 'X-RCA-Client'
export const CLIENT_HEADER_VALUE = 'web'

/** Optional binding between a browser request and the account whose data it targets. */
export const ACCOUNT_SCOPE_HEADER = 'X-RCA-User'

/** Most activities one user may store. Re-uploads of an existing activity do not count again. */
export const MAX_ACTIVITIES_PER_USER = 5000

/** Most original-file bytes one user may store, summed over their activities. */
export const MAX_STORED_BYTES_PER_USER = 1024 * 1024 * 1024

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 25
/** Maximum total digest JSON bytes returned by one activity-list request. */
export const MAX_PAGE_DIGEST_BYTES = 1024 * 1024
/** Maximum full JSON response, including record envelopes and original file names. */
export const MAX_PAGE_BODY_BYTES = MAX_PAGE_DIGEST_BYTES + 64 * 1024
