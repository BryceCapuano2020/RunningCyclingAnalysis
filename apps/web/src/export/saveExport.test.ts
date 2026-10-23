// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportFileName, saveAccountExport } from './saveExport'

describe('exportFileName', () => {
  it('uses the local calendar date', () => {
    // The Date constructor reads local time, so this is the same date on every machine.
    expect(exportFileName(new Date(2026, 9, 3, 0, 30))).toBe('rca-export-2026-10-03.json')
  })

  it('pads the month and day', () => {
    expect(exportFileName(new Date(2027, 0, 9, 23, 59))).toBe('rca-export-2027-01-09.json')
  })
})

describe('saveAccountExport', () => {
  let clicks: HTMLAnchorElement[]
  let blobs: Blob[]

  beforeEach(() => {
    clicks = []
    blobs = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this)
    })
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob)
      return 'blob:export'
    })
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('downloads the JSON text under the dated file name', async () => {
    saveAccountExport(
      new Blob(['{"format":"rca-export"}'], { type: 'application/json' }),
      new Date(2026, 9, 23),
    )

    expect(clicks).toHaveLength(1)
    expect(clicks[0]?.download).toBe('rca-export-2026-10-23.json')
    expect(clicks[0]?.href).toBe('blob:export')
    expect(blobs[0]?.type).toBe('application/json')
    await expect(blobs[0]?.text()).resolves.toBe('{"format":"rca-export"}')
  })

  it('removes the link and frees the object URL after the download starts', () => {
    vi.useFakeTimers()
    saveAccountExport(new Blob(['{}'], { type: 'application/json' }), new Date(2026, 9, 23))

    expect(document.querySelector('a[download]')).toBeNull()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export')
  })
})
