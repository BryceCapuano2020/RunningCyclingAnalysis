import { afterEach, describe, expect, it } from 'vitest'
import { noteUploadTitles, uploadTitles } from './uploadPolicy'

afterEach(() => {
  noteUploadTitles({ uploadTitles: false })
})

describe('the choice to send titles, as the worker holds it', () => {
  it('is off until a request says otherwise', () => {
    expect(uploadTitles()).toBe(false)
  })

  it('takes the choice a request carries, on the request or on its sync options', () => {
    noteUploadTitles({ uploadTitles: true })
    expect(uploadTitles()).toBe(true)
    noteUploadTitles({ sync: { uploadTitles: false } })
    expect(uploadTitles()).toBe(false)
    noteUploadTitles({ sync: { uploadTitles: true } })
    expect(uploadTitles()).toBe(true)
  })

  it('keeps the last choice when a request carries none', () => {
    noteUploadTitles({ uploadTitles: true })
    noteUploadTitles({})
    noteUploadTitles({ sync: null })
    noteUploadTitles({ sync: {} })
    expect(uploadTitles()).toBe(true)
  })
})
