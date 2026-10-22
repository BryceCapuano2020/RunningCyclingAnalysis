import { and, eq, sql } from 'drizzle-orm'
import type { Me, Profile, ProfileInput, User } from '@rca/contract'
import type { Deps } from '../deps.ts'
import type { Db } from '../env.ts'
import { must } from '../util.ts'
import { oauthAccounts, profiles, users } from '../db/schema.ts'
import type { GoogleProfile } from './google.ts'
import { HttpError } from '../errors.ts'

export const GOOGLE_PROVIDER = 'google'

export const DEFAULT_PROFILE: ProfileInput = {
  massKg: 75,
  bikeMassKg: 9,
  units: 'imperial',
  keepFiles: false,
}

type UserRow = typeof users.$inferSelect
type ProfileRow = typeof profiles.$inferSelect

export function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, name: row.name, pictureUrl: row.pictureUrl }
}

export function toProfile(row: ProfileRow): Profile {
  return {
    massKg: row.massKg,
    bikeMassKg: row.bikeMassKg,
    units: row.units,
    keepFiles: row.keepFiles,
    updatedAt: row.updatedAt,
  }
}

/** Returns the user's profile, creating the default one if it is missing. */
export async function ensureProfile(db: Db, userId: string, now: number): Promise<Profile> {
  const existing = await db.select().from(profiles).where(eq(profiles.userId, userId)).get()
  if (existing) return toProfile(existing)
  const created = { userId, ...DEFAULT_PROFILE, updatedAt: now }
  await db.insert(profiles).values(created).onConflictDoNothing()
  return toProfile(created)
}

export async function buildMe(
  db: Db,
  deps: Deps,
  user: User,
  fileRetentionAvailable = true,
): Promise<Me> {
  return {
    user,
    profile: await ensureProfile(db, user.id, deps.now()),
    fileRetentionAvailable,
  }
}

async function refreshUser(
  db: Db,
  id: string,
  values: { name: string; pictureUrl: string | null },
): Promise<UserRow> {
  return must(await db.update(users).set(values).where(eq(users.id, id)).returning().get(), 'user')
}

async function createUser(
  db: Db,
  deps: Deps,
  values: { email: string; name: string; pictureUrl: string | null },
): Promise<UserRow> {
  return must(
    await db
      .insert(users)
      .values({ id: deps.randomUUID(), ...values, createdAt: deps.now() })
      .returning()
      .get(),
    'user',
  )
}

/** Finds or creates the user for a verified Google account and links the Google identity. */
export async function signInWithGoogle(
  db: Db,
  deps: Deps,
  profile: GoogleProfile,
): Promise<UserRow> {
  const link = await db
    .select()
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, GOOGLE_PROVIDER),
        eq(oauthAccounts.providerUserId, profile.sub),
      ),
    )
    .get()
  if (link) {
    return refreshUser(db, link.userId, { name: profile.name, pictureUrl: profile.pictureUrl })
  }

  // Google verifies the email, so an existing account with it is probably the same person. It is
  // linked only when that account has no Google identity yet; otherwise a second Google account
  // could take it over by claiming the same address.
  const existing = await db.select().from(users).where(eq(users.email, profile.email)).get()
  let user = existing
  if (!user) {
    try {
      user = await createUser(db, deps, {
        email: profile.email,
        name: profile.name,
        pictureUrl: profile.pictureUrl,
      })
    } catch (error) {
      // A simultaneous first sign-in may have created the same verified email. Continue through
      // the atomic identity-link path so competing Google identities cannot both claim it.
      user = await db.select().from(users).where(eq(users.email, profile.email)).get()
      if (!user) throw error
    }
  }

  // Linking is a check-then-write unless the existing-Google check participates in the same D1
  // statement. This conditional insert lets SQLite serialize concurrent callbacks for different
  // Google subjects that report the same verified email: only the first identity can be attached.
  await db.run(sql`INSERT INTO oauth_accounts (provider, provider_user_id, user_id)
    SELECT ${GOOGLE_PROVIDER}, ${profile.sub}, ${user.id}
    WHERE NOT EXISTS (
      SELECT 1 FROM oauth_accounts
      WHERE provider = ${GOOGLE_PROVIDER} AND user_id = ${user.id}
    )
    ON CONFLICT(provider, provider_user_id) DO NOTHING`)

  const linked = await db
    .select()
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, GOOGLE_PROVIDER),
        eq(oauthAccounts.providerUserId, profile.sub),
      ),
    )
    .get()
  if (linked) {
    return refreshUser(db, linked.userId, { name: profile.name, pictureUrl: profile.pictureUrl })
  }

  throw new HttpError(
    409,
    'account_conflict',
    'This email is already linked to a different Google account. Sign in with that account.',
  )
}

/** Local development sign-in. Routes refuse to reach this outside ENVIRONMENT=development. */
export async function signInDev(
  db: Db,
  deps: Deps,
  input: { email: string; name: string },
): Promise<UserRow> {
  const existing = await db.select().from(users).where(eq(users.email, input.email)).get()
  if (existing) return refreshUser(db, existing.id, { name: input.name, pictureUrl: null })
  return createUser(db, deps, { email: input.email, name: input.name, pictureUrl: null })
}
