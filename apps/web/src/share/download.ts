import { saveBlob } from '../download/saveBlob'

/**
 * Saves the canvas as a PNG on this device, under the given file name. Nothing is uploaded. Resolves
 * false when the browser cannot encode the canvas, so the caller can say so.
 */
export function saveCanvasPng(canvas: HTMLCanvasElement, fileName: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(false)
      return
    }
    try {
      canvas.toBlob((blob) => {
        // The browser calls this later, outside the promise, so a throw here must settle it.
        try {
          if (blob === null) {
            resolve(false)
            return
          }
          saveBlob(blob, fileName)
          resolve(true)
        } catch {
          resolve(false)
        }
      }, 'image/png')
    } catch {
      resolve(false)
    }
  })
}
