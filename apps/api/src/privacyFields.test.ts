import { readFileSync, readdirSync } from 'node:fs'
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

// Whole sentences of the page, so a column cannot be matched by a word that appears elsewhere.
const DISCLOSED: Record<string, string> = {
  'users.id':
    'google account id, email, display name, and profile picture address (loaded from google), and when the account was created',
  'users.email':
    'google account id, email, display name, and profile picture address (loaded from google), and when the account was created',
  'users.name':
    'google account id, email, display name, and profile picture address (loaded from google), and when the account was created',
  'users.picture_url':
    'google account id, email, display name, and profile picture address (loaded from google), and when the account was created',
  'users.created_at':
    'google account id, email, display name, and profile picture address (loaded from google), and when the account was created',
  'users.activity_count':
    "activity ids, a key from each activity's sport and start, digest versions, your activity count and digest bytes, whether and when deletion started, when your profile last changed, and an upload reservation token while a file uploads",
  'users.deleting_at':
    "activity ids, a key from each activity's sport and start, digest versions, your activity count and digest bytes, whether and when deletion started, when your profile last changed, and an upload reservation token while a file uploads",
  'users.digest_bytes':
    "activity ids, a key from each activity's sport and start, digest versions, your activity count and digest bytes, whether and when deletion started, when your profile last changed, and an upload reservation token while a file uploads",
  'users.file_bytes':
    'accounts, sessions, settings, summaries, daily counts and the size of each kept original are in a cloudflare d1 database',
  'oauth_accounts.provider':
    'google account id, email, display name, and profile picture address (loaded from google), and when the account was created',
  'oauth_accounts.provider_user_id':
    'google account id, email, display name, and profile picture address (loaded from google), and when the account was created',
  'oauth_accounts.user_id':
    'google account id, email, display name, and profile picture address (loaded from google), and when the account was created',
  'sessions.id':
    'a one-way hash of your session token, your account, and its creation and expiry times',
  'sessions.user_id':
    'a one-way hash of your session token, your account, and its creation and expiry times',
  'sessions.expires_at':
    'a one-way hash of your session token, your account, and its creation and expiry times',
  'sessions.created_at':
    'a one-way hash of your session token, your account, and its creation and expiry times',
  'profiles.user_id':
    'google account id, email, display name, and profile picture address (loaded from google), and when the account was created',
  'profiles.mass_kg':
    'weight, bike and gear weight, units, whether you keep original files, and year of birth and sex if given',
  'profiles.bike_mass_kg':
    'weight, bike and gear weight, units, whether you keep original files, and year of birth and sex if given',
  'profiles.units':
    'weight, bike and gear weight, units, whether you keep original files, and year of birth and sex if given',
  'profiles.keep_files':
    'weight, bike and gear weight, units, whether you keep original files, and year of birth and sex if given',
  'profiles.birth_year':
    'weight, bike and gear weight, units, whether you keep original files, and year of birth and sex if given',
  'profiles.sex':
    'weight, bike and gear weight, units, whether you keep original files, and year of birth and sex if given',
  'profiles.updated_at':
    "activity ids, a key from each activity's sport and start, digest versions, your activity count and digest bytes, whether and when deletion started, when your profile last changed, and an upload reservation token while a file uploads",
  'athlete_measurements.user_id':
    'google account id, email, display name, and profile picture address (loaded from google), and when the account was created',
  'athlete_measurements.kind':
    'each weight, max heart rate, threshold power or threshold pace you add on profile, with the date it takes effect, and for the heart rate and thresholds the sport. each also records when you last changed it',
  'athlete_measurements.sport':
    'each weight, max heart rate, threshold power or threshold pace you add on profile, with the date it takes effect, and for the heart rate and thresholds the sport. each also records when you last changed it',
  'athlete_measurements.from_date':
    'each weight, max heart rate, threshold power or threshold pace you add on profile, with the date it takes effect, and for the heart rate and thresholds the sport. each also records when you last changed it',
  'athlete_measurements.value':
    'each weight, max heart rate, threshold power or threshold pace you add on profile, with the date it takes effect, and for the heart rate and thresholds the sport. each also records when you last changed it',
  'athlete_measurements.updated_at':
    'each weight, max heart rate, threshold power or threshold pace you add on profile, with the date it takes effect, and for the heart rate and thresholds the sport. each also records when you last changed it',
  'activities.id':
    "activity ids, a key from each activity's sport and start, digest versions, your activity count and digest bytes, whether and when deletion started, when your profile last changed, and an upload reservation token while a file uploads",
  'activities.user_id':
    'google account id, email, display name, and profile picture address (loaded from google), and when the account was created',
  'activities.dedupe_key':
    "activity ids, a key from each activity's sport and start, digest versions, your activity count and digest bytes, whether and when deletion started, when your profile last changed, and an upload reservation token while a file uploads",
  'activities.sport':
    'name (as in the summary kept in this browser), sport, start and save times; file name and sha-256 hash; distance, duration and elevation gain; and the analysis summary',
  'activities.start_ms':
    'name (as in the summary kept in this browser), sport, start and save times; file name and sha-256 hash; distance, duration and elevation gain; and the analysis summary',
  'activities.name':
    'name (as in the summary kept in this browser), sport, start and save times; file name and sha-256 hash; distance, duration and elevation gain; and the analysis summary',
  'activities.digest_version':
    "activity ids, a key from each activity's sport and start, digest versions, your activity count and digest bytes, whether and when deletion started, when your profile last changed, and an upload reservation token while a file uploads",
  'activities.digest_json':
    'name (as in the summary kept in this browser), sport, start and save times; file name and sha-256 hash; distance, duration and elevation gain; and the analysis summary',
  'activities.file_name':
    'name (as in the summary kept in this browser), sport, start and save times; file name and sha-256 hash; distance, duration and elevation gain; and the analysis summary',
  'activities.file_hash':
    'name (as in the summary kept in this browser), sport, start and save times; file name and sha-256 hash; distance, duration and elevation gain; and the analysis summary',
  'activities.file_key': 'under keys that include your account and activity ids',
  'activities.file_size':
    'accounts, sessions, settings, summaries, daily counts and the size of each kept original are in a cloudflare d1 database',
  'activities.file_reservation_token':
    "activity ids, a key from each activity's sport and start, digest versions, your activity count and digest bytes, whether and when deletion started, when your profile last changed, and an upload reservation token while a file uploads",
  'activities.created_at':
    'name (as in the summary kept in this browser), sport, start and save times; file name and sha-256 hash; distance, duration and elevation gain; and the analysis summary',
  'identity_budget.identity_key':
    "a one-way code made from your google id with a server key is written beside the number of accounts that id has created today and, on deletion, that day's counts. these are kept about two days",
  'identity_budget.day':
    "a one-way code made from your google id with a server key is written beside the number of accounts that id has created today and, on deletion, that day's counts. these are kept about two days",
  'identity_budget.action':
    "a one-way code made from your google id with a server key is written beside the number of accounts that id has created today and, on deletion, that day's counts. these are kept about two days",
  'identity_budget.used':
    "a one-way code made from your google id with a server key is written beside the number of accounts that id has created today and, on deletion, that day's counts. these are kept about two days",
  'daily_budget.user_id':
    'per account, downloads, saves, deletions, uploads, profile changes, dated-setting changes and library reads, kept about a week, up to eight utc days',
  'daily_budget.day':
    'per account, downloads, saves, deletions, uploads, profile changes, dated-setting changes and library reads, kept about a week, up to eight utc days',
  'daily_budget.action':
    'per account, downloads, saves, deletions, uploads, profile changes, dated-setting changes and library reads, kept about a week, up to eight utc days',
  'daily_budget.used':
    'per account, downloads, saves, deletions, uploads, profile changes, dated-setting changes and library reads, kept about a week, up to eight utc days',
  'upload_slots.user_id':
    'short-lived rows for uploads in progress and for account deletions not yet finished',
  'upload_slots.slot_id':
    'short-lived rows for uploads in progress and for account deletions not yet finished',
  'upload_slots.expires_at':
    'short-lived rows for uploads in progress and for account deletions not yet finished',
  'pending_account_deletions.user_id':
    'short-lived rows for uploads in progress and for account deletions not yet finished',
  'pending_account_deletions.requested_at':
    'short-lived rows for uploads in progress and for account deletions not yet finished',
  'pending_account_deletions.sweep_pending':
    'short-lived rows for uploads in progress and for account deletions not yet finished',
}

/**
 * A column the schema still has and nothing writes: the library cursor is a stateless position now, so the page no
 * longer lists it. The second test keeps it unwritten; start writing it and the page must say so.
 */
const UNUSED = new Set(['users.list_cursor'])

/** The deployment-wide row holds counters and a listing cursor for object keys: nothing about a person. */
const DEPLOYMENT_WIDE = 'r2_storage_budget'

const HINT_COLUMN =
  'The schema and DISCLOSED disagree: map the new column to the sentence of apps/web/privacy.html that lists it, or remove the entry for a column that is gone.'
const HINT_PHRASE =
  'privacy.html does not say this: update the page, or the mapping if the page was reworded on purpose.'

const stored = Object.values(schema).flatMap((table) => {
  const config = getTableConfig(table)
  return config.columns.map((column) => `${config.name}.${column.name}`)
})

describe('the privacy page and the stored columns', () => {
  it('discloses every column the schema stores, and maps no column the schema lost', () => {
    const personal = stored.filter(
      (column) => !column.startsWith(`${DEPLOYMENT_WIDE}.`) && !UNUSED.has(column),
    )
    expect(
      personal.filter((column) => !(column in DISCLOSED)),
      HINT_COLUMN,
    ).toEqual([])
    expect(
      Object.keys(DISCLOSED).filter((column) => !personal.includes(column)),
      HINT_COLUMN,
    ).toEqual([])
  })

  it('has the phrase that discloses each mapped column', () => {
    const missing = Object.entries(DISCLOSED)
      .filter(([, phrase]) => !page.includes(phrase))
      .map(([column, phrase]) => `${column}: "${phrase}"`)
    expect(missing, HINT_PHRASE).toEqual([])
  })
})

describe('a column the page does not list', () => {
  it('is written by nothing outside the schema and its migrations', () => {
    const sources = readdirSync(new URL('./', import.meta.url), {
      recursive: true,
      encoding: 'utf8',
    })
      .filter((path) => /\.ts$/.test(path) && !/\.test\.ts$/.test(path) && path !== 'db/schema.ts')
      .map((path) => [path, readFileSync(new URL(path, import.meta.url), 'utf8')] as const)
    const writers = sources
      .filter(([, text]) => /listCursor|list_cursor/.test(text))
      .map(([path]) => path)
    expect(writers).toEqual([])
  })
})
