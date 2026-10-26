import { describe, expect, it } from 'vitest'
import { EXPORT_GUIDES, GUIDES_CHECKED_ON, HISTORY_ADVICE } from './exportGuides'

/** Every line a guide shows, for the copy rules that apply to all of them. */
function guideText(): string[] {
  return EXPORT_GUIDES.flatMap((guide) => [
    guide.service,
    guide.helpName,
    guide.contains,
    guide.alsoAvailable ?? '',
    ...guide.steps,
  ])
}

function guideFor(service: string) {
  const guide = EXPORT_GUIDES.find((item) => item.service === service)
  if (!guide) throw new Error(`No guide for ${service}`)
  return guide
}

describe('EXPORT_GUIDES', () => {
  it('lists the five services once each, in the order the tiles show them', () => {
    expect(EXPORT_GUIDES.map((guide) => guide.service)).toEqual([
      'Strava',
      'Garmin Connect',
      'Wahoo',
      'COROS',
      'Zwift',
    ])
  })

  it('gives every guide one to five steps', () => {
    for (const guide of EXPORT_GUIDES) {
      expect(guide.steps.length).toBeGreaterThanOrEqual(1)
      expect(guide.steps.length).toBeLessThanOrEqual(5)
    }
  })

  it('names each service’s help by its short name, and links it over https', () => {
    for (const guide of EXPORT_GUIDES) {
      expect(guide.helpName).toMatch(/^[A-Za-z]+$/)
      expect(guide.helpUrl).toMatch(/^https:\/\//)
    }
  })

  it('marks only Strava as checked on its own help page', () => {
    expect(EXPORT_GUIDES.filter((guide) => guide.verified).map((guide) => guide.service)).toEqual([
      'Strava',
    ])
  })

  it('dates the check in code, as the day the steps were read', () => {
    expect(GUIDES_CHECKED_ON).toBe('24 October 2026')
  })

  it('makes Strava the route for many, and says so on its own guide', () => {
    expect(guideFor('Strava').contains).toMatch(/route for many/)
  })

  it('gives Zwift no route for many, since a ride from before a Strava link is not uploaded', () => {
    expect(guideFor('Zwift').alsoAvailable).toBeUndefined()
    expect(guideFor('Zwift').contains).toMatch(/Repeat the steps for each ride/)
  })

  it('gives Wahoo no route for many, and sends one workout to Strava to export it there', () => {
    const wahoo = guideFor('Wahoo')
    expect(wahoo.alsoAvailable).toBeUndefined()
    expect(wahoo.steps).toHaveLength(2)
    expect(wahoo.steps[0]).toBe('In the Wahoo app, share the workout to Strava.')
    expect(wahoo.steps[1]).toMatch(/Strava guide/)
    expect(wahoo.steps.join(' ')).not.toMatch(/Export Original/)
  })

  it('tells the visitor to drop the Garmin download as it is: a FIT file, in a zip or as .fit.gz', () => {
    const garmin = guideFor('Garmin Connect')
    expect(garmin.steps[2]).toBe(
      'Drop the download here as it is. It is a .FIT file, sometimes inside a zip or as a .fit.gz.',
    )
    expect(garmin.steps.join(' ')).not.toMatch(/Unzip/)
  })

  it('gives Garmin a whole-history request that can take days', () => {
    expect(guideFor('Garmin Connect').alsoAvailable).toMatch(/garmin\.com\/account\/datamanagement/)
    expect(guideFor('Garmin Connect').alsoAvailable).toMatch(/can take days/)
  })

  it('marks Strava’s wait step, the one that says the link may take a few hours', () => {
    const strava = guideFor('Strava')
    expect(strava.waitStep).toBe(3)
    expect(strava.steps[3]).toMatch(/a few hours/)
  })

  it('uses curly quotes, never straight double quotes', () => {
    for (const line of guideText()) expect(line).not.toMatch(/"/)
  })

  it('names the zip, not the .gz files inside it, except the .fit.gz a download can be', () => {
    for (const line of guideText()) {
      expect(line.replace(/\.fit\.gz/g, '')).not.toMatch(/\.gz|gzip/i)
    }
  })
})

describe('HISTORY_ADVICE', () => {
  it('says that a Strava export brings the most history at once', () => {
    expect(HISTORY_ADVICE).toBe('A Strava export brings in the most history at once.')
  })
})
