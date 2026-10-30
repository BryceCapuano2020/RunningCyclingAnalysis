import { describe, expect, it } from 'vitest'
import * as limits from './limits.ts'

/** Bound parameters one D1 statement may carry (Cloudflare's limit for Workers). */
const D1_BOUND_PARAMETERS = 100

/**
 * Pins every shared limit to its reviewed value. Changing one is then a deliberate test change,
 * not a silent edit that the API, web client and tests would all follow.
 */
describe('contract limits', () => {
  it('pins the request header and account scope names', () => {
    expect(limits.CLIENT_HEADER).toBe('X-RCA-Client')
    expect(limits.CLIENT_HEADER_VALUE).toBe('web')
    expect(limits.ACCOUNT_SCOPE_HEADER).toBe('X-RCA-User')
  })

  it('pins the upload and digest sizes', () => {
    expect(limits.MAX_DIGEST_BYTES).toBe(256 * 1024)
    expect(limits.MAX_FILE_BYTES).toBe(50 * 1024 * 1024)
    expect(limits.MAX_ACTIVITIES_PER_USER).toBe(5000)
    expect(limits.MAX_STORED_BYTES_PER_USER).toBe(1024 * 1024 * 1024)
    expect(limits.MAX_CONCURRENT_UPLOADS_PER_USER).toBe(2)
  })

  it('pins the per-user daily budgets', () => {
    expect(limits.DAILY_LIMITS).toEqual({
      fileDownload: 5000,
      profileWrite: 50,
      activityDelete: 50,
      activityCreate: 5000,
      fileUpload: 2000,
      read: 100,
      measurementWrite: 200,
      measurementRead: 300,
    })
  })

  it('lets one day create as many activities as a library may hold', () => {
    expect(limits.DAILY_LIMITS.activityCreate).toBe(limits.MAX_ACTIVITIES_PER_USER)
  })

  it('lets one day rebuild the largest library from its originals', () => {
    expect(limits.DAILY_LIMITS.fileDownload).toBe(limits.MAX_ACTIVITIES_PER_USER)
  })

  it('pins the list meter, the session cap and the account-create cap', () => {
    expect(limits.LIST_ROWS_PER_DAY).toBe(200_000)
    expect(limits.MAX_SESSIONS_PER_USER).toBe(10)
    expect(limits.MAX_ACCOUNT_CREATES_PER_DAY).toBe(5)
  })

  it('lets a day of listing cover dozens of cold loads of the largest library', () => {
    expect(limits.LIST_ROWS_PER_DAY / limits.MAX_ACTIVITIES_PER_USER).toBeGreaterThanOrEqual(40)
  })

  it('pins the most dated settings a user may keep', () => {
    expect(limits.MAX_MEASUREMENTS_PER_USER).toBe(200)
  })

  it('pins the deployment-wide R2 budgets', () => {
    expect(limits.MAX_GLOBAL_R2_WRITE_BYTES).toBe(4 * 1024 * 1024 * 1024)
    expect(limits.MAX_MONTHLY_R2_PUT_BYTES).toBe(2 * 1024 * 1024 * 1024)
    expect(limits.MIN_GLOBAL_R2_PUT_CHARGE_BYTES).toBe(64 * 1024)
    expect(limits.MAX_GLOBAL_R2_MONTHLY_OPERATIONS).toBe(100_000)
    expect(limits.MAX_GLOBAL_R2_STANDARD_OPERATIONS).toBe(90_000)
  })

  it('keeps a page within the 100 bound parameters D1 allows a statement', () => {
    // The page read binds the user id and then one id per row.
    expect(limits.MAX_PAGE_SIZE + 1).toBeLessThanOrEqual(D1_BOUND_PARAMETERS)
    expect(limits.DEFAULT_PAGE_SIZE).toBeLessThanOrEqual(limits.MAX_PAGE_SIZE)
  })

  it('pins the page sizes and page body limits', () => {
    expect(limits.DEFAULT_PAGE_SIZE).toBe(90)
    expect(limits.MAX_PAGE_SIZE).toBe(90)
    expect(limits.MAX_PAGE_DIGEST_BYTES).toBe(512 * 1024)
    expect(limits.MAX_RECORD_ID_CHARS).toBe(64)
    expect(limits.MAX_FILE_NAME_CHARS).toBe(255)
    expect(limits.MAX_CURSOR_CHARS).toBe(256)
    expect(limits.MAX_RECORD_ENVELOPE_BYTES).toBe(2022)
    expect(limits.MAX_PAGE_BODY_BYTES).toBe(707_862)
  })

  it('sizes the page body for 90 worst-case records beside a full digest budget', () => {
    // The worst case of a string is six bytes a character, a control character as \u0001. The
    // numbers are the largest safe integers, one of them negative.
    const worst = JSON.stringify({
      id: '\u0001'.repeat(limits.MAX_RECORD_ID_CHARS),
      fileName: '\u0001'.repeat(limits.MAX_FILE_NAME_CHARS),
      hasFile: false,
      fileSize: Number.MAX_SAFE_INTEGER,
      createdAt: -Number.MAX_SAFE_INTEGER,
    })
    // The record gains a digest key, and a comma follows it. Its digest text is counted apart.
    const record = worst.length + ',"digest":'.length + ','.length
    expect(limits.MAX_RECORD_ENVELOPE_BYTES).toBe(record)
    const rest = JSON.stringify({
      items: [],
      nextCursor: '\u0001'.repeat(limits.MAX_CURSOR_CHARS),
      unreadable: Number.MAX_SAFE_INTEGER,
    })
    expect(limits.MAX_PAGE_BODY_BYTES).toBe(
      limits.MAX_PAGE_DIGEST_BYTES + limits.MAX_PAGE_SIZE * record + rest.length,
    )
  })
})
