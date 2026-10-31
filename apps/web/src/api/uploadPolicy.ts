/**
 * Whether the titles of the athlete's activities are sent to the account (D12 E7, RCA-032). The choice is kept on the
 * device (`ui/uploadTitlesPreference.ts`) and arrives with the requests that save: an import, a library load (which
 * resumes saves a reload left), a rebuild and the adoption of what this browser kept. The worker holds the last one it
 * was given, and a request that does not say keeps it. Until it has been told, titles are not sent.
 */
let sendTitles = false

/** Whether titles are sent now. */
export function uploadTitles(): boolean {
  return sendTitles
}

/** Holds the choice a request carries, if it carries one. */
export function noteUploadTitles(request: {
  uploadTitles?: boolean
  sync?: { uploadTitles?: boolean } | null
}): void {
  const choice = request.uploadTitles ?? request.sync?.uploadTitles
  if (choice !== undefined) sendTitles = choice
}
