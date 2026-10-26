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

/** A canvas whose toBlob hands back the blob later, as browsers do, after the call has returned. */
function canvasDeliveringLater(blob: Blob): HTMLCanvasElement {
  return {
    toBlob: (callback: BlobCallback) => {
      setTimeout(() => callback(blob), 0)
    },
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
  it('downloads the image under the given name and reports that it was saved', async () => {
    const saved = await saveCanvasPng(
      canvasReturning(new Blob(['png'], { type: 'image/png' })),
      'rca-summary-story.png',
    )
    expect(saved).toBe('saved')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clicks).toEqual([{ href: 'blob:rca-test', download: 'rca-summary-story.png' }])
  })

  it('frees the object URL after the download has had time to start', async () => {
    vi.useFakeTimers()
    await saveCanvasPng(canvasReturning(new Blob(['png'], { type: 'image/png' })), 'a.png')
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:rca-test')
  })

  it('reports failure and downloads nothing when the browser produces no image', async () => {
    expect(await saveCanvasPng(canvasReturning(null), 'a.png')).toBeNull()
    expect(clicks).toEqual([])
  })

  it('reports failure when the canvas cannot encode a blob at all', async () => {
    const canvas = {} as unknown as HTMLCanvasElement
    expect(await saveCanvasPng(canvas, 'a.png')).toBeNull()
    expect(clicks).toEqual([])
  })

  it('reports failure, rather than hanging, when the browser refuses the download after the blob arrives', async () => {
    createObjectURL.mockImplementationOnce(() => {
      throw new Error('no blob URLs')
    })
    await expect(
      saveCanvasPng(canvasDeliveringLater(new Blob(['png'], { type: 'image/png' })), 'a.png'),
    ).resolves.toBeNull()
    expect(clicks).toEqual([])
  })

  it('reports failure, rather than rejecting, when the canvas throws while it is asked for a blob', async () => {
    const canvas = {
      toBlob: () => {
        throw new Error('the canvas is tainted')
      },
    } as unknown as HTMLCanvasElement
    await expect(saveCanvasPng(canvas, 'a.png')).resolves.toBeNull()
    expect(clicks).toEqual([])
  })
})

describe('saveCanvasPng where the device can share files', () => {
  const png = () => new Blob(['png'], { type: 'image/png' })

  /** A touch device whose share sheet takes files, with the given behaviour for share. */
  function touchShareSheet(share: (data: ShareData) => Promise<void>, canShare = true) {
    const shareMock = vi.fn(share)
    Object.defineProperty(navigator, 'share', { configurable: true, value: shareMock })
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: vi.fn(() => canShare),
    })
    setPointer('coarse')
    return shareMock
  }

  /** Says whether the page's primary pointer is a finger, as matchMedia would report it. */
  function setPointer(kind: 'coarse' | 'fine') {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: query === '(pointer: coarse)' && kind === 'coarse',
        media: query,
      }),
    })
  }

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'share')
    Reflect.deleteProperty(navigator, 'canShare')
    Reflect.deleteProperty(window, 'matchMedia')
  })

  it('offers the image to the share sheet of a touch device as a PNG file, and reports it shared', async () => {
    const share = touchShareSheet(async () => undefined)
    expect(await saveCanvasPng(canvasReturning(png()), 'rca-summary-story.png')).toBe('shared')
    expect(share).toHaveBeenCalledTimes(1)
    const [data] = share.mock.calls[0] ?? []
    expect(data?.files?.[0]).toMatchObject({ name: 'rca-summary-story.png', type: 'image/png' })
    expect(clicks).toEqual([])
  })

  it('keeps the download on a pointer device, even where the browser could share a file', async () => {
    const share = touchShareSheet(async () => undefined)
    setPointer('fine')
    expect(await saveCanvasPng(canvasReturning(png()), 'a.png')).toBe('saved')
    expect(share).not.toHaveBeenCalled()
    expect(clicks).toEqual([{ href: 'blob:rca-test', download: 'a.png' }])
  })

  it('downloads the image when the share sheet cannot take files', async () => {
    const share = touchShareSheet(async () => undefined, false)
    expect(await saveCanvasPng(canvasReturning(png()), 'a.png')).toBe('saved')
    expect(share).not.toHaveBeenCalled()
    expect(clicks).toEqual([{ href: 'blob:rca-test', download: 'a.png' }])
  })

  it('reports a share the visitor cancelled as cancelled, with no download and no saved status', async () => {
    touchShareSheet(async () => {
      throw new DOMException('Share canceled', 'AbortError')
    })
    expect(await saveCanvasPng(canvasReturning(png()), 'a.png')).toBe('cancelled')
    expect(clicks).toEqual([])
  })

  it('downloads the image when the share is refused, as after the tap has lapsed', async () => {
    touchShareSheet(async () => {
      throw new DOMException('Not allowed', 'NotAllowedError')
    })
    expect(await saveCanvasPng(canvasReturning(png()), 'a.png')).toBe('saved')
    expect(clicks).toEqual([{ href: 'blob:rca-test', download: 'a.png' }])
  })
})
