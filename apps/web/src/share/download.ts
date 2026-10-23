import { saveBlob } from '../download/saveBlob'

/** The file name of the saved card. */
export const SHARE_FILE_NAME = 'rca-summary.png'

/**
 * Saves the canvas as a PNG on this device. Nothing is uploaded. Resolves false when the browser
 * cannot encode the canvas, so the caller can say so.
 */
export function saveCanvasPng(canvas: HTMLCanvasElement): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(false)
      return
    }
    canvas.toBlob((blob) => {
      if (blob === null) {
        resolve(false)
        return
      }
      saveBlob(blob, SHARE_FILE_NAME)
      resolve(true)
    }, 'image/png')
  })
}
