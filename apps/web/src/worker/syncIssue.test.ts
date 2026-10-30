import { SyncFailure } from '@rca/core/session'
import { describe, expect, it } from 'vitest'
import { ApiRequestError } from '../api/client'
import { syncFailureOf, syncIssueFor } from './syncIssue'

describe('syncIssueFor', () => {
  it.each([
    ['a sign-out', new ApiRequestError(401, 'unauthenticated', 'Sign in required'), 'signed-out'],
    [
      'an account change',
      new ApiRequestError(409, 'account_changed', 'Changed'),
      'account-changed',
    ],
    ['an unknown conflict', new ApiRequestError(409, 'something_else', 'Off'), 'server'],
    [
      'original files turned off in the profile',
      new ApiRequestError(409, 'files_disabled', 'Off'),
      'originals-off',
    ],
    ['a full library', new ApiRequestError(403, 'activity_quota', 'Full'), 'activity-quota'],
    ['full storage', new ApiRequestError(403, 'storage_quota', 'Full'), 'storage-quota'],
    [
      'a full saved-analysis quota',
      new ApiRequestError(403, 'digest_quota', 'Full'),
      'digest-quota',
    ],
    ['a full database', new ApiRequestError(503, 'database_full', 'Paused'), 'database-full'],
    [
      'a saved copy from another file',
      new ApiRequestError(409, 'activity_conflict', 'Different file'),
      'activity-conflict',
    ],
    [
      'an exhausted storage budget',
      new ApiRequestError(429, 'storage_budget_exhausted', 'Paused'),
      'storage-budget',
    ],
    ['a rate limit', new ApiRequestError(429, 'rate_limited', 'Slow down'), 'rate-limited'],
    ['a daily limit', new ApiRequestError(429, 'daily_limit', 'Tomorrow'), 'daily-limit'],
    [
      'an upload lease',
      new ApiRequestError(429, 'upload_in_progress', 'Wait'),
      'upload-in-progress',
    ],
    ['a deletion', new ApiRequestError(409, 'account_deleting', 'Deleting'), 'account-deleting'],
    ['a file over the limit', new SyncFailure('file-too-large', 'Too big'), 'file-too-large'],
    ['no connection', new ApiRequestError(0, 'network_error', 'Offline'), 'network'],
    ['a server error', new ApiRequestError(500, 'internal_error', 'Oops'), 'server'],
    ['a validation error', new ApiRequestError(400, 'invalid_request', 'Bad'), 'server'],
    ['a plain error', new Error('boom'), 'server'],
    ['a sync failure', new SyncFailure('storage-quota', 'Too large'), 'storage-quota'],
  ])('maps %s', (_label, error, code) => {
    expect(syncIssueFor(error)).toBe(code)
  })
})

describe('syncFailureOf', () => {
  it('gives a failed request the cause it maps to, with its message', () => {
    const failure = syncFailureOf(new ApiRequestError(429, 'daily_limit', 'Tomorrow'))
    expect(failure).toBeInstanceOf(SyncFailure)
    expect(failure).toMatchObject({ code: 'daily-limit', message: 'Tomorrow' })
  })

  it('keeps a failure that already has its cause', () => {
    const failure = new SyncFailure('file-too-large', 'Too big')
    expect(syncFailureOf(failure)).toBe(failure)
  })

  it('counts anything else as a server failure', () => {
    expect(syncFailureOf('offline')).toMatchObject({ code: 'server', message: 'offline' })
  })
})
