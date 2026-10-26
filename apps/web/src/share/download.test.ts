// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canShareImage,
  canvasFile,
  previewUrl,
  releasePreview,
  saveFile,
  shareFile,
} from './download'

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
  Reflect.deleteProperty(navigator, 'share')
  Reflect.deleteProperty(navigator, 'canShare')
  Reflect.deleteProperty(window, 'matchMedia')
  vi.useRealTimers()
})

const png = () => new Blob(['png'], { type: 'image/png' })
const imageFile = () => new File(['png'], 'balance-square.png', { type: 'image/png' })

/** Says whether the primary pointer is a finger, as matchMedia would report it. */
function setPointer(kind: 'coarse' | 'fine') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query === '(pointer: coarse)' && kind === 'coarse',
      media: query,
    }),
  })
}

describe('canvasFile', () => {
  it('encodes the canvas once, as a PNG file under the name it is given', async () => {
    const toBlob = vi.fn((callback: BlobCallback) => callback(png()))
    const file = await canvasFile({ toBlob } as unknown as HTMLCanvasElement, 'balance-square.png')
    expect(toBlob).toHaveBeenCalledTimes(1)
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png')
    expect(file).toBeInstanceOf(File)
    expect(file?.name).toBe('balance-square.png')
    expect(file?.type).toBe('image/png')
  })

  it('gives null when the browser produces no image', async () => {
    expect(await canvasFile(canvasReturning(null), 'a.png')).toBeNull()
  })

  it('gives null when the canvas cannot encode a blob at all', async () => {
    expect(await canvasFile({} as HTMLCanvasElement, 'a.png')).toBeNull()
  })

  it('gives null, rather than rejecting, when the canvas throws while it is asked for a blob', async () => {
    const canvas = {
      toBlob: () => {
        throw new Error('tainted canvas')
      },
    }
    await expect(canvasFile(canvas as unknown as HTMLCanvasElement, 'a.png')).resolves.toBeNull()
  })
})

describe('saveFile', () => {
  it('downloads the file under its own name, and says it was saved', () => {
    expect(saveFile(imageFile())).toBe('saved')
    expect(clicks).toEqual([{ href: 'blob:rca-test', download: 'balance-square.png' }])
  })
})

describe('shareFile', () => {
  it('starts the share before any promise settles, so a click can open the share sheet', () => {
    const share = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    void shareFile(imageFile())
    // Synchronously, with no await before it: the call is already made when shareFile returns.
    expect(share).toHaveBeenCalledTimes(1)
    expect(share).toHaveBeenCalledWith({
      files: [expect.objectContaining({ name: 'balance-square.png' })],
      title: 'balance-square.png',
    })
  })

  it('reports an image the share sheet took as shared, with no download', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => undefined })
    expect(await shareFile(imageFile())).toBe('shared')
    expect(clicks).toEqual([])
  })

  it('reports a share the visitor cancelled as cancelled, with no download', async () => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => {
        throw new DOMException('Share canceled', 'AbortError')
      },
    })
    expect(await shareFile(imageFile())).toBe('cancelled')
    expect(clicks).toEqual([])
  })

  it('downloads the file when the share is refused, as after the tap has lapsed', async () => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => {
        throw new DOMException('Not allowed', 'NotAllowedError')
      },
    })
    expect(await shareFile(imageFile())).toBe('saved')
    expect(clicks).toEqual([{ href: 'blob:rca-test', download: 'balance-square.png' }])
  })

  it('downloads the file when the share cannot start at all', async () => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: () => {
        throw new TypeError('no share')
      },
    })
    expect(await shareFile(imageFile())).toBe('saved')
    expect(clicks).toHaveLength(1)
  })
})

describe('canShareImage', () => {
  it('is true on a touch device whose share sheet takes this image', () => {
    setPointer('coarse')
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn() })
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) })
    expect(canShareImage(imageFile())).toBe(true)
    expect(navigator.canShare).toHaveBeenCalledWith({
      files: [expect.objectContaining({ name: 'balance-square.png' })],
    })
  })

  it('is false when the share sheet cannot take an image file', () => {
    setPointer('coarse')
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn() })
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => false) })
    expect(canShareImage(imageFile())).toBe(false)
  })

  it('is false on a pointer device, even where the browser could share a file', () => {
    setPointer('fine')
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn() })
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) })
    expect(canShareImage(imageFile())).toBe(false)
  })

  it('is false on a touch device with no share sheet', () => {
    setPointer('coarse')
    expect(canShareImage(imageFile())).toBe(false)
  })
})

describe('previewUrl and releasePreview', () => {
  it('gives an address for the image the browser holds, and releases it when done', () => {
    const file = imageFile()
    expect(previewUrl(file)).toBe('blob:rca-test')
    expect(createObjectURL).toHaveBeenCalledWith(file)
    releasePreview('blob:rca-test')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:rca-test')
  })
})
