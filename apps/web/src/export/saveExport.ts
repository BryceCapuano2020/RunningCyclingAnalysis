import { saveBlob } from '../download/saveBlob'

/** The export's file name for a day, in local time: rca-export-YYYY-MM-DD.json. */
export function exportFileName(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `rca-export-${now.getFullYear()}-${month}-${day}.json`
}

/** Saves the built export file for the given day. */
export function saveAccountExport(file: Blob, now: Date): void {
  saveBlob(file, exportFileName(now))
}
