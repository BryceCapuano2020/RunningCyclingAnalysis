import { describe, expect, it } from 'vitest'
import { READABLE_ACCEPT, isReadableFileName } from './readableFiles'

describe('READABLE_ACCEPT', () => {
  it('is the file picker list of the same types the import reads, in one place', () => {
    expect(READABLE_ACCEPT).toBe('.fit,.gpx,.tcx,.gz,.zip')
    for (const extension of READABLE_ACCEPT.split(',')) {
      expect(isReadableFileName(`activity${extension}`), extension).toBe(true)
    }
  })
})

describe('isReadableFileName', () => {
  it('reads the activity formats the file picker offers, whatever their case', () => {
    for (const name of [
      'ride.fit',
      'RIDE.FIT',
      'run.gpx',
      'run.tcx',
      'export.zip',
      'ride.fit.gz',
    ]) {
      expect(isReadableFileName(name), name).toBe(true)
    }
  })

  it('refuses a file whose name says it is not one the import reads', () => {
    for (const name of [
      'notes.txt',
      'photo.png',
      'fit',
      'fitfile',
      'ride.fit.txt',
      'run.fit.zipx',
    ]) {
      expect(isReadableFileName(name), name).toBe(false)
    }
  })
})
