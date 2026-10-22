/** Largest JSON digest accepted by POST /api/activities, in bytes. */
export const MAX_DIGEST_BYTES = 256 * 1024

/** Largest original file accepted by PUT /api/activities/:id/file, in bytes. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024

/** Every non-GET /api request must send this header with the value below (CSRF defence). */
export const CLIENT_HEADER = 'X-RCA-Client'
export const CLIENT_HEADER_VALUE = 'web'
