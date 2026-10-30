import { eq } from 'drizzle-orm'
import { DEFAULT_BIKE_MASS_KG } from '@rca/contract'
import type { Me, Profile, UnitPreference, User } from '@rca/contract'
import type { Deps } from '../deps.ts'
import type { Db } from '../env.ts'
import { must } from '../util.ts'
import { profiles, users } from '../db/schema.ts'
import { accountDeleting } from '../errors.ts'

export const GOOGLE_PROVIDER = 'google'

type UserRow = typeof users.$inferSelect
type ProfileRow = typeof profiles.$inferSelect

/**
 * A new profile. The body mass, age and sex are unset until the rider saves them. The units are the
 * ones the sign-in request's language starts in, so the caller passes them.
 */
export function defaultProfile(units: UnitPreference): Omit<ProfileRow, 'userId' | 'updatedAt'> {
  return {
    massKg: null,
    bikeMassKg: DEFAULT_BIKE_MASS_KG,
    units,
    keepFiles: false,
    birthYear: null,
    sex: null,
  }
}

export function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, name: row.name, pictureUrl: row.pictureUrl }
}

export function toProfile(row: ProfileRow): Profile {
  return {
    massKg: row.massKg,
    bikeMassKg: row.bikeMassKg,
    units: row.units,
    keepFiles: row.keepFiles,
    birthYear: row.birthYear,
    sex: row.sex,
    updatedAt: row.updatedAt,
  }
}

/**
 * Returns the user's profile, creating the default one in `units` if it is missing. An existing
 * profile keeps its own units, whatever the request's language.
 */
export async function ensureProfile(
  db: Db,
  userId: string,
  now: number,
  units: UnitPreference,
): Promise<Profile> {
  const existing = await db.select().from(profiles).where(eq(profiles.userId, userId)).get()
  if (existing) return toProfile(existing)
  const created = { userId, ...defaultProfile(units), updatedAt: now }
  await db.insert(profiles).values(created).onConflictDoNothing()
  return toProfile(created)
}

export async function buildMe(
  db: Db,
  deps: Deps,
  user: User,
  fileRetentionAvailable: boolean,
  units: UnitPreference,
): Promise<Me> {
  return {
    user,
    profile: await ensureProfile(db, user.id, deps.now(), units),
    fileRetentionAvailable,
  }
}

/** Accounts being deleted cannot sign in again; the deletion has to finish first. */
export async function refreshUser(
  db: Db,
  id: string,
  values: { name: string; pictureUrl: string | null },
): Promise<UserRow> {
  const row = must(
    await db.update(users).set(values).where(eq(users.id, id)).returning().get(),
    'user',
  )
  if (row.deletingAt !== null) throw accountDeleting()
  return row
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

/** Local development sign-in. The route refuses to reach this unless isLocalDevelopment holds. */
export async function signInDev(
  db: Db,
  deps: Deps,
  input: { email: string; name: string },
): Promise<UserRow> {
  const existing = await db.select().from(users).where(eq(users.email, input.email)).get()
  if (existing) return refreshUser(db, existing.id, { name: input.name, pictureUrl: null })
  return createUser(db, deps, { email: input.email, name: input.name, pictureUrl: null })
}
