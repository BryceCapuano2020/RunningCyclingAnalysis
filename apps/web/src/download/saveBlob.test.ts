// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveBlob } from './saveBlob'

const createObjectURL = vi.fn(() => 'blob:saved')
const revokeObjectURL = vi.fn()
const clicks: { href: string; download: string }[] = []

/** Records each download link the page clicks, and stops jsdom from navigating to it. */
function recordClick(event: MouseEvent) {
  const link = event.target
  if (!(link instanceof HTMLAnchorElement)) return
  clicks.push({ href: link.href, download: link.download })
  event.preventDefault()
}

beforeEach(() => {
  clicks.length = 0
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  Object.assign(URL, { createObjectURL, revokeObjectURL })
  document.addEventListener('click', recordClick)
})

afterEach(() => {
  document.removeEventListener('click', recordClick)
  vi.useRealTimers()
})

describe('saveBlob', () => {
  it('downloads the blob under the given file name', () => {
    saveBlob(new Blob(['x']), 'notes.json')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clicks).toEqual([{ href: 'blob:saved', download: 'notes.json' }])
  })

  it('removes its link from the page and frees the object URL after the download starts', () => {
    vi.useFakeTimers()
    saveBlob(new Blob(['x']), 'notes.json')
    expect(document.querySelector('a[download]')).toBeNull()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:saved')
  })
})
