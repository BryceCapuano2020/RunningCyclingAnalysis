import { describe, expect, it } from 'vitest'
import { readStylesheet } from './ui/components/stylesheet'

/*
 * "The server stores only what the privacy page lists" (docs/ENGINEERING.md). The analysis summary (the digest)
 * is stored in one column, so privacyFields.test.ts cannot see its fields. Every field of `ActivityDigest` is
 * mapped here to the phrase of apps/web/privacy.html that names it, so a field added to the digest fails
 * this test until the page says it. Revision 7 added three, and the page says what the stored shift reveals.
 */
const page = (await readStylesheet(import.meta.url, '../privacy.html'))
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/[‘’]/g, "'")
  .replace(/\s+/g, ' ')
  .toLowerCase()

const types = await readStylesheet(import.meta.url, '../../../packages/core/src/types.ts')

/** The keys of `interface ActivityDigest`, read from the source so a new one cannot be missed. */
function digestFields(): string[] {
  const body = /export interface ActivityDigest \{([\s\S]*?)\n\}/.exec(types)?.[1] ?? ''
  const keys: string[] = []
  for (const line of body.split('\n')) {
    const key = /^ {2}([a-zA-Z]+)\??:/.exec(line)?.[1]
    if (key !== undefined) keys.push(key)
  }
  return keys
}

const DISCLOSED: Record<string, string> = {
  version: 'the version numbers of the summary',
  modelRevision: 'of the analysis that made it',
  id: "the activity's id and name",
  name: "the activity's id and name",
  sport: 'its sport, start time and duration',
  startMs: 'its sport, start time and duration',
  durationS: 'its sport, start time and duration',
  distanceM: 'its distance and elevation gain',
  elevationGainM: 'its distance and elevation gain',
  hasHeartRate: 'whether it has a heart rate and whether it was indoors',
  indoor: 'whether it has a heart rate and whether it was indoors',
  powerSource: 'how its power was found (measured, estimated or none)',
  flags: 'quality flags with a count for each kind',
  flagCounts: 'quality flags with a count for each kind',
  maxHeartRate: 'the highest heart rate and the average heart rate and power',
  avgHeartRate: 'the highest heart rate and the average heart rate and power',
  avgPowerW: 'the highest heart rate and the average heart rate and power',
  movingS: 'the time spent moving',
  curve: 'best efforts at each length',
  distanceBests: 'and by distance for a run',
  splits: 'split times',
  hrBlocks: 'heart-rate blocks',
  climbSections: 'climbs',
  calibration: 'calibration sums',
  distributions: 'distributions of heart rate, power and speed',
  durability: 'durability and drift figures',
  drift: 'durability and drift figures',
  sessionKey: 'a key made from sport and start',
  race: 'whether it was marked a race or a walking pace',
  walkingPace: 'whether it was marked a race or a walking pace',
  temperature: 'the middle air temperature the device recorded, with the share of the activity',
  athleteType: "the label you gave the activity in your strava export's list",
  localDayShift: 'the local calendar day of the activity compared with its utc day',
}

describe('the privacy page and the fields of the analysis summary', () => {
  it('maps every field of the digest, and no field the digest lost', () => {
    const fields = digestFields()
    expect(fields.length).toBeGreaterThan(30)
    expect(
      fields.filter((field) => !(field in DISCLOSED)),
      'map the new digest field to the phrase of apps/web/privacy.html that names it, and add the phrase to the page',
    ).toEqual([])
    expect(
      Object.keys(DISCLOSED).filter((field) => !fields.includes(field)),
      'a mapped field is gone from the digest: remove it here, and from the page',
    ).toEqual([])
  })

  it('has the phrase that names each field', () => {
    const missing = Object.entries(DISCLOSED)
      .filter(([, phrase]) => !page.includes(phrase))
      .map(([field, phrase]) => `${field}: "${phrase}"`)
    expect(missing, 'privacy.html does not say this: update the page, or the mapping').toEqual([])
  })

  it('names the three fields revision 7 added as that revision’s', () => {
    expect(page).toContain('from model revision 7 it also holds')
    for (const field of ['temperature', 'athleteType', 'localDayShift']) {
      expect(DISCLOSED[field], field).toBeDefined()
    }
  })

  it('says what the stored day shift reveals: a band of hours, about one zone near local midnight', () => {
    expect(page).toContain('that shift is not a place and not a utc offset')
    expect(page).toContain('narrows your time zone to a band of hours')
    expect(page).toContain('to about one zone if you often train near local midnight')
    expect(page).toContain('it is read from the file, never from your device')
  })
})
