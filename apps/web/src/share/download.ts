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

/** Whether this device's share sheet can take the file. */
function canShareFile(file: File): boolean {
  return (
    isTouchDevice() &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  )
}

/**
 * Offers the image to the device's share sheet, which can save it or send it on. Where the device
 * cannot share a file, or the share is refused, the image is downloaded instead.
 */
async function deliver(blob: Blob, fileName: string): Promise<CanvasDelivery> {
  const file = new File([blob], fileName, { type: 'image/png' })
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: fileName })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      // Refused here, for example once the visitor's tap has lapsed: the download takes over.
    }
  }
  saveBlob(blob, fileName)
  return 'saved'
}

/**
 * Hands the canvas over as a PNG under the given file name: to the share sheet on a touch device,
 * otherwise as a download. Nothing is uploaded. Resolves null when the browser cannot encode the
 * canvas or hand the image over, so the caller can say so.
 */
export function saveCanvasPng(
  canvas: HTMLCanvasElement,
  fileName: string,
): Promise<CanvasDelivery | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(null)
      return
    }
    try {
      canvas.toBlob((blob) => {
        // The browser calls this later, outside the promise, so a throw here must settle it.
        try {
          if (blob === null) {
            resolve(null)
            return
          }
          deliver(blob, fileName).then(resolve, () => resolve(null))
        } catch {
          resolve(null)
        }
      }, 'image/png')
    } catch {
      resolve(null)
    }
  })
}
