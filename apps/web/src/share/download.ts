import { saveBlob } from '../download/saveBlob'

/**
 * How the image reached the visitor: through the device's share sheet, as a download, or not at
 * all because the visitor closed the share sheet.
 */
export type CanvasDelivery = 'shared' | 'saved' | 'cancelled'

/** Whether the primary pointer is a finger: the share sheet is for phones and tablets, not desktops. */
function isTouchDevice(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

/** Whether this device offers a share sheet that can take files: a touch device whose browser can share one. */
function offersShareSheet(): boolean {
  return (
    isTouchDevice() &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  )
}

/** Whether the device's share sheet can take this image, so the action can say it shares it. */
export function canShareImage(file: File): boolean {
  return offersShareSheet() && navigator.canShare({ files: [file] })
}

/**
 * Encodes the canvas once, as a PNG file under the given name. Resolves null when the browser cannot
 * encode the canvas, so the caller can say so.
 */
export function canvasFile(canvas: HTMLCanvasElement, fileName: string): Promise<File | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(null)
      return
    }
    try {
      canvas.toBlob((blob) => {
        // The browser calls this later, outside the promise, so a throw here must settle it.
        try {
          resolve(blob === null ? null : new File([blob], fileName, { type: 'image/png' }))
        } catch {
          resolve(null)
        }
      }, 'image/png')
    } catch {
      resolve(null)
    }
  })
}

/** Downloads the image under its own name. */
export function saveFile(file: File): CanvasDelivery {
  saveBlob(file, file.name)
  return 'saved'
}

/**
 * Offers the image to the device's share sheet. The share starts at once, synchronously, so a click
 * can open the sheet: nothing may await before it. A share the visitor cancels says nothing; one the
 * browser refuses, as after the tap has lapsed, downloads the image instead.
 */
export function shareFile(file: File): Promise<CanvasDelivery> {
  let sharing: Promise<void>
  try {
    sharing = navigator.share({ files: [file], title: file.name })
  } catch (error) {
    return Promise.resolve(refusedShare(error, file))
  }
  return sharing.then(
    (): CanvasDelivery => 'shared',
    (error: unknown) => refusedShare(error, file),
  )
}

function refusedShare(error: unknown, file: File): CanvasDelivery {
  if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
  return saveFile(file)
}

/** A preview address for an image the browser holds. Release it with releasePreview. */
export function previewUrl(file: File): string {
  return URL.createObjectURL(file)
}

export function releasePreview(url: string): void {
  URL.revokeObjectURL(url)
}
