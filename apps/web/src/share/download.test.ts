// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveCanvasPng } from './download'

const clicks: { href: string; download: string }[] = []

/** Records each download link the page clicks, and stops jsdom from navigating to it. */
function recordClick(event: MouseEvent) {
  const link = event.target
  if (!(link instanceof HTMLAnchorElement)) return
  clicks.push({ href: link.href, download: link.download })
  event.preventDefault()
}

/** A canvas whose toBlob hands back the given blob. */
function canvasReturning(blob: Blob | null): HTMLCanvasElement {
  return {
    toBlob: (callback: BlobCallback) => callback(blob),
  } as unknown as HTMLCanvasElement
}

const createObjectURL = vi.fn(() => 'blob:rca-test')
const revokeObjectURL = vi.fn()

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

describe('saveCanvasPng', () => {
  it('downloads the image as rca-summary.png and reports that it was saved', async () => {
    const saved = await saveCanvasPng(canvasReturning(new Blob(['png'], { type: 'image/png' })))
    expect(saved).toBe(true)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clicks).toEqual([{ href: 'blob:rca-test', download: 'rca-summary.png' }])
  })

  it('frees the object URL after the download has had time to start', async () => {
    vi.useFakeTimers()
    await saveCanvasPng(canvasReturning(new Blob(['png'], { type: 'image/png' })))
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:rca-test')
  })

  it('reports failure and downloads nothing when the browser produces no image', async () => {
    expect(await saveCanvasPng(canvasReturning(null))).toBe(false)
    expect(clicks).toEqual([])
  })

  it('reports failure when the canvas cannot encode a blob at all', async () => {
    const canvas = {} as unknown as HTMLCanvasElement
    expect(await saveCanvasPng(canvas)).toBe(false)
    expect(clicks).toEqual([])
  })
})
