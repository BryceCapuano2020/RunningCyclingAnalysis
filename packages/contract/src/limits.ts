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

/**
 * Per-user daily budgets. Each counts one kind of request per UTC day and resets at 00:00 UTC.
 * Exceeding one returns 429 with code `daily_limit`. Activity creates and original uploads are
 * deliberately above the 50-a-day default: a first Strava export import is hundreds to thousands
 * of activities. Creates may fill a whole library in one day, so the largest library's first
 * import completes in one day. See apps/api/LIMITS.md.
 */
export const DAILY_LIMITS = {
  fileDownload: 50,
  profileWrite: 50,
  activityDelete: 50,
  activityCreate: MAX_ACTIVITIES_PER_USER,
  fileUpload: 2000,
  /** Library listings and profile reads. One listing of 5,000 rows is 5,000 D1 rows read. */
  read: 100,
} as const
export type DailyLimitAction = keyof typeof DAILY_LIMITS

/** Most original-file uploads one user may have in progress at once. */
export const MAX_CONCURRENT_UPLOADS_PER_USER = 2

/** Lifetime cap for R2 PUT charges across the deployment. Failed attempts are not refunded. */
export const MAX_GLOBAL_R2_WRITE_BYTES = 4 * 1024 * 1024 * 1024

/**
 * Most new R2 bytes the deployment may write (PUT attempts) in one UTC calendar month. Each
 * attempt is charged at least MIN_GLOBAL_R2_PUT_CHARGE_BYTES. The counter resets at month start.
 */
export const MAX_MONTHLY_R2_PUT_BYTES = 2 * 1024 * 1024 * 1024
/** Minimum monthly-budget charge per PUT attempt, including empty/small files and failures. */
export const MIN_GLOBAL_R2_PUT_CHARGE_BYTES = 64 * 1024
/** Hard monthly R2 operation cap (Class A plus Class B, all calls): 10% of the 1,000,000 free Class A. */
export const MAX_GLOBAL_R2_MONTHLY_OPERATIONS = 100_000
/** Ordinary PUT/GET traffic stops here, preserving 10,000 operations for cleanup LIST calls. */
export const MAX_GLOBAL_R2_STANDARD_OPERATIONS = 90_000

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 25
/** Maximum total digest JSON bytes returned by one activity-list request. */
export const MAX_PAGE_DIGEST_BYTES = 1024 * 1024
/** Maximum full JSON response, including record envelopes and original file names. */
export const MAX_PAGE_BODY_BYTES = MAX_PAGE_DIGEST_BYTES + 64 * 1024

/** Most digest JSON bytes one user may store, summed over their activities. See apps/api/LIMITS.md. */
export const MAX_DIGEST_BYTES_PER_USER = 64 * 1024 * 1024
/**
 * Creates are refused while the database's last-seen size is above this. D1 Free allows 500 MB per
 * database; the margin leaves room for in-flight writes and the ledger row itself.
 */
export const DATABASE_SOFT_LIMIT_BYTES = 450 * 1024 * 1024

/** Most original-file bytes one user may upload per UTC day, summed over their uploads. */
export const DAILY_UPLOAD_BYTES = 1024 * 1024 * 1024
