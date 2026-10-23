/** Long enough for the browser to start the download before the object URL is freed. */
const REVOKE_DELAY_MS = 1000

/**
 * Saves a blob as a file on this device. Nothing is uploaded. The file is named by the page's
 * link, so the browser keeps it under that name.
 */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}
