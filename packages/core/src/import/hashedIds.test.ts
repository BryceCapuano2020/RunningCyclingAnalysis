import { describe, expect, it } from 'vitest'
import { encodeFit } from '../fit'
import { fileNameOf } from '../duplicates'
import { sampleDataset } from '../synthetic'
import { parseActivityFile } from './index'
import { hashedFileName } from './minimise'

/**
 * An activity's id is made from its file's name. From revision 7 it is made from a hash of the name (E7), so the id on
 * the device, in the trace cache and in the account are one. Below it the id is as it was.
 */
const run = sampleDataset().activities.find((activity) => activity.sport === 'run')!
const bytes = new Uint8Array(encodeFit(run, { gps: true }))
const idOf = (fileName: string, hashedIds?: boolean) => {
  const result = parseActivityFile(bytes, fileName, undefined, {
    ...(hashedIds === undefined ? {} : { hashedIds }),
  })
  if (!result.ok) throw new Error(result.reason)
  return result.activities[0]!.id
}

describe('the id of an imported activity', () => {
  it('is made from the file name as it is while the current revision is below 7', () => {
    expect(idOf('activities/12345678.fit')).toMatch(/-activities\/12345678\.fit$/)
    expect(idOf('activities/12345678.fit', false)).toMatch(/-activities\/12345678\.fit$/)
  })

  it('is made from a hash of the file name when asked, keeping the extension', () => {
    const id = idOf('activities/12345678.fit', true)
    expect(fileNameOf(id)).toBe(hashedFileName('activities/12345678.fit'))
    expect(id).not.toContain('12345678')
    expect(id).toMatch(/\.fit$/)
  })

  it('differs from the plain id only in the file name', () => {
    const plain = idOf('activities/12345678.fit', false)
    const hashed = idOf('activities/12345678.fit', true)
    expect(plain.replace(/^(\d+)-.*$/, '$1')).toBe(hashed.replace(/^(\d+)-.*$/, '$1'))
  })

  it('is not hashed twice when the file already has a hashed name (a rebuild of a stored activity)', () => {
    const name = hashedFileName('activities/12345678.fit')
    expect(fileNameOf(idOf(name, true))).toBe(name)
  })
})
