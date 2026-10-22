import { and, eq } from 'drizzle-orm'
import type { Me, Profile, ProfileInput, User } from '@rca/contract'
import type { Deps } from '../deps.ts'
import type { Db } from '../env.ts'
import { must } from '../util.ts'
import { oauthAccounts, profiles, users } from '../db/schema.ts'
import type { GoogleProfile } from './google.ts'

export const GOOGLE_PROVIDER = 'google'

export const DEFAULT_PROFILE: ProfileInput = {
  massKg: 75,
  bikeMassKg: 9,
  units: 'imperial',
  keepFiles: true,
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

export async function buildMe(db: Db, deps: Deps, user: User): Promise<Me> {
  return {
    user,
    profile: await ensureProfile(db, user.id, deps.now()),
  }
}

/** Creates the user with this email, or refreshes the existing one. */
async function upsertUserByEmail(
  db: Db,
  deps: Deps,
  values: { email: string; name: string; pictureUrl: string | null },
): Promise<UserRow> {
  const found = await db.select().from(users).where(eq(users.email, values.email)).get()
  if (found) {
    return must(
      await db
        .update(users)
        .set({ name: values.name, pictureUrl: values.pictureUrl })
        .where(eq(users.id, found.id))
        .returning()
        .get(),
      'user',
    )
  }
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
    return must(
      await db
        .update(users)
        .set({ name: profile.name, pictureUrl: profile.pictureUrl })
        .where(eq(users.id, link.userId))
        .returning()
        .get(),
      'user',
    )
  }

  // The email is verified by Google, so an existing account with that email is the same person.
  const user = await upsertUserByEmail(db, deps, {
    email: profile.email,
    name: profile.name,
    pictureUrl: profile.pictureUrl,
  })
  await db.insert(oauthAccounts).values({
    provider: GOOGLE_PROVIDER,
    providerUserId: profile.sub,
    userId: user.id,
  })
  return user
}

/** Local development sign-in. Routes refuse to reach this outside ENVIRONMENT=development. */
export async function signInDev(
  db: Db,
  deps: Deps,
  input: { email: string; name: string },
): Promise<UserRow> {
  return upsertUserByEmail(db, deps, { email: input.email, name: input.name, pictureUrl: null })
}
