import { readFileSync } from 'node:fs'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'
import { schema } from './db/schema.ts'

/*
 * "The server stores only what the privacy page lists" (docs/ENGINEERING.md). Every column the schema
 * stores is mapped here to the phrase of apps/web/privacy.html that discloses it, so a new column fails
 * until it is mapped and the page says it. The deployment-wide ledger table holds no personal data and is left out.
 */
const page = readFileSync(new URL('../../web/privacy.html', import.meta.url), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/[‘’]/g, "'")
  .replace(/\s+/g, ' ')
  .toLowerCase()

const ACCOUNT = 'google account id'
const DAILY = 'daily counts'

const DISCLOSED: Record<string, string> = {
  'users.id': ACCOUNT,
  'users.email': 'email',
  'users.name': 'display name',
  'users.picture_url': 'profile picture address',
  'users.created_at': 'when the account was created',
  'users.activity_count': 'your activity count',
  'users.deleting_at': 'whether and when deletion started',
  'users.digest_bytes': 'digest bytes',
  'users.file_bytes': 'size of each kept original',
  'users.list_cursor': 'library page cursor',

  'oauth_accounts.provider': ACCOUNT,
  'oauth_accounts.provider_user_id': ACCOUNT,
  'oauth_accounts.user_id': ACCOUNT,

  'sessions.id': 'one-way hash of your session token',
  'sessions.user_id': 'your account',
  'sessions.expires_at': 'creation and expiry times',
  'sessions.created_at': 'creation and expiry times',

  'profiles.user_id': ACCOUNT,
  'profiles.mass_kg': 'weight',
  'profiles.bike_mass_kg': 'bike and gear weight',
  'profiles.units': 'units',
  'profiles.keep_files': 'whether you keep original files',
  'profiles.birth_year': 'year of birth',
  'profiles.sex': 'sex if given',
  'profiles.updated_at': 'when your profile last changed',

  'athlete_measurements.user_id': ACCOUNT,
  'athlete_measurements.kind': 'each weight, max heart rate, threshold power or threshold pace',
  'athlete_measurements.sport': 'the sport',
  'athlete_measurements.from_date': 'with the date it takes effect',
  'athlete_measurements.value': 'each weight, max heart rate, threshold power or threshold pace',
  'athlete_measurements.updated_at': 'when you last changed it',

  'activities.id': 'activity ids',
  'activities.user_id': ACCOUNT,
  'activities.dedupe_key': "a key from each activity's sport and start",
  'activities.sport': 'sport',
  'activities.start_ms': 'start and save times',
  'activities.name': 'name (as in the summary kept in this browser)',
  'activities.digest_version': 'digest versions',
  'activities.digest_json': 'the analysis summary',
  'activities.file_name': 'file name and sha-256 hash',
  'activities.file_hash': 'file name and sha-256 hash',
  'activities.file_key': 'under keys that include your account and activity ids',
  'activities.file_size': 'size of each kept original',
  'activities.file_reservation_token': 'an upload reservation token',
  'activities.created_at': 'start and save times',

  'daily_budget.user_id': DAILY,
  'daily_budget.day': DAILY,
  'daily_budget.action': DAILY,
  'daily_budget.used': DAILY,

  'upload_slots.user_id': 'short-lived rows for uploads in progress',
  'upload_slots.slot_id': 'short-lived rows for uploads in progress',
  'upload_slots.expires_at': 'short-lived rows for uploads in progress',

  'pending_account_deletions.user_id': 'account deletions not yet finished',
  'pending_account_deletions.requested_at': 'account deletions not yet finished',
  'pending_account_deletions.sweep_pending': 'account deletions not yet finished',
}

/** The deployment-wide row holds counters and a listing cursor for object keys: nothing about a person. */
const DEPLOYMENT_WIDE = 'r2_storage_budget'

const stored = Object.values(schema).flatMap((table) => {
  const config = getTableConfig(table)
  return config.columns.map((column) => `${config.name}.${column.name}`)
})

describe('the privacy page and the stored columns', () => {
  it('discloses every column the schema stores, and maps no column the schema lost', () => {
    const personal = stored.filter((column) => !column.startsWith(`${DEPLOYMENT_WIDE}.`))
    expect(personal.filter((column) => !(column in DISCLOSED))).toEqual([])
    expect(Object.keys(DISCLOSED).filter((column) => !personal.includes(column))).toEqual([])
  })

  it('has the phrase that discloses each mapped column', () => {
    const missing = Object.entries(DISCLOSED)
      .filter(([, phrase]) => !page.includes(phrase))
      .map(([column, phrase]) => `${column}: "${phrase}"`)
    expect(missing).toEqual([])
  })
})
