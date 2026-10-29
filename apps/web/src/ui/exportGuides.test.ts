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

  it('marks every guide as checked on its service’s own help page', () => {
    expect(EXPORT_GUIDES.filter((guide) => !guide.verified).map((guide) => guide.service)).toEqual(
      [],
    )
  })

  it('dates the check in code, as the day the steps were read', () => {
    expect(GUIDES_CHECKED_ON).toBe('27 October 2026')
  })

  it('makes Strava the route for many, and says so on its own guide', () => {
    expect(guideFor('Strava').contains).toMatch(/route for many/)
  })

  it('gives Zwift one activity at a time, as its help article does, with no route for many', () => {
    const zwift = guideFor('Zwift')
    expect(zwift.alsoAvailable).toBeUndefined()
    expect(zwift.contains).toMatch(/Repeat the steps for each one/)
    expect(zwift.steps).toContain('Choose the cog icon, then “Download FIT file”.')
    expect(zwift.helpUrl).toMatch(/locating-your-activity-log-and-workout-files/)
  })

  it('gives Wahoo its own download of one workout’s FIT file, and Strava for many', () => {
    const wahoo = guideFor('Wahoo')
    expect(wahoo.steps[1]).toBe(
      'Choose the three dots at the top right of its summary, then “Share activity”, then “Download .fit activity”.',
    )
    expect(wahoo.contains).toBe('One workout at a time, as a FIT file.')
    expect(wahoo.alsoAvailable).toMatch(/Strava guide/)
  })

  it('names Garmin’s menu item as its help article does, and drops the download as it is', () => {
    const garmin = guideFor('Garmin Connect')
    expect(garmin.steps[1]).toBe(
      'Open the activity, choose the settings gear icon at the top right, then “Export File”.',
    )
    expect(garmin.steps.join(' ')).not.toMatch(/Export Original|Unzip/)
    expect(garmin.steps[2]).toMatch(/^Drop the download here as it is, zipped or not\./)
  })

  it('gives Garmin a whole-history request with the wait its help article states', () => {
    const also = guideFor('Garmin Connect').alsoAvailable ?? ''
    expect(also).toMatch(/“Export Your Data”, then “Request Data Export”/)
    expect(also).toMatch(/within 48 hours but can take up to 30 days/)
    expect(also).toMatch(/Drop the zip here as it is\./)
  })

  it('names COROS’s Activity List tab and Export Data, as its help article does', () => {
    expect(guideFor('COROS').steps[1]).toBe(
      'Open the Activity List tab at the top, then choose “Export Data” on the right.',
    )
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
