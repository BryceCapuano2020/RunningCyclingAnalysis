/** The file name of the saved card. */
export const SHARE_FILE_NAME = 'rca-summary.png'

/** Long enough for the browser to start the download before the object URL is freed. */
const REVOKE_DELAY_MS = 1000

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
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = SHARE_FILE_NAME
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
      resolve(true)
    }, 'image/png')
  })
}
