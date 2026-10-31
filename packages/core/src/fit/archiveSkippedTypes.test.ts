import { gzipSync, strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTRACT_LIMITS, extractFitFiles } from './archive'
import { otherExtensionOf } from './zipDirectory'

const TEXT = strToU8('not an activity')

async function skippedIn(source: File, listed?: (entry: string) => boolean): Promise<string[]> {
  const types: string[] = []
  await extractFitFiles(
    source,
    () => undefined,
    () => undefined,
    DEFAULT_EXTRACT_LIMITS,
    listed,
    (extension) => types.push(extension),
  )
  return types.sort()
}

describe('the extension of an activity file the app does not read', () => {
  it('is told for a single file, in lower case, without the dot or the .gz', async () => {
    expect(await skippedIn(new File([TEXT], 'ROUTE.KML'))).toEqual(['kml'])
    expect(await skippedIn(new File([TEXT], 'ride.pwx.gz'))).toEqual(['pwx'])
  })

  it('is told for each such file of a zip, at any depth', async () => {
    const inner = zipSync({ 'c.hrm': TEXT })
    const zip = zipSync({
      'a.pwx': TEXT,
      'b.pwx': TEXT,
      'routes/map.kmz': TEXT,
      'nested.zip': inner,
    })
    expect(await skippedIn(new File([zip], 'export.zip'))).toEqual(['hrm', 'kmz', 'pwx', 'pwx'])
  })

  it('is not told for what the zip’s own list leaves out: those are not activities', async () => {
    const zip = zipSync({ 'activities/a.pwx': TEXT, 'routes/map.kml': TEXT })
    const onlyActivities = (entry: string) => entry.startsWith('activities/')
    expect(await skippedIn(new File([zip], 'export.zip'), onlyActivities)).toEqual(['pwx'])
  })

  it('is not told for the formats the app reads or for other files', async () => {
    const zip = zipSync({ 'a.fit': gzipSync(TEXT), 'notes.txt': TEXT, 'photo.jpg': TEXT })
    expect(await skippedIn(new File([zip], 'export.zip'))).toEqual([])
  })

  it('is read from the name', () => {
    expect(otherExtensionOf('x/Y.PWX.gz')).toBe('pwx')
  })
})
