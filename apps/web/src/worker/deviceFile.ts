/** The file a kept digest was made from: its name inside its source, and the lowercase hex SHA-256 of its bytes. */
export interface DeviceFile {
  fileName: string
  fileHash: string
}

/** A hash the server accepts. A row kept without one (older rows, or a browser with no crypto) is not added to an account. */
const FILE_HASH = /^[0-9a-f]{64}$/

/** The file to keep with a row, or null when its hash is missing or not a hash. */
export function deviceFileOf(file: { fileName: string; fileHash: string }): DeviceFile | null {
  return FILE_HASH.test(file.fileHash) && file.fileName !== '' ? file : null
}

/** A write was refused because the library was emptied (in this tab or another) since the writer loaded it. */
export class LibraryReplaced extends Error {
  constructor() {
    super('The library kept in this browser was emptied since this was loaded')
    this.name = 'LibraryReplaced'
  }
}
