import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** A syntactic age X25519 recipient shape; `age` validates its checksum before any export. */
const AGE_RECIPIENT = /^age1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}$/

/**
 * Returns the recipients in a recipients file. Blank lines and `#` comments are ignored. Throws
 * when there is no recipient or when any other line has the wrong shape. The workflow then asks
 * `age` itself to parse and use these recipients before it exports any account data.
 */
export function parseBackupRecipients(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
  if (lines.length === 0) {
    throw new Error('ops/backup-recipient.txt has no age public key. Add one before backing up.')
  }
  for (const line of lines) {
    if (!AGE_RECIPIENT.test(line)) {
      throw new Error(
        'ops/backup-recipient.txt contains a line that is not an age public key (age1...). ' +
          'The placeholder must be replaced before backups can run.',
      )
    }
  }
  return lines
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = process.argv[2] ?? 'ops/backup-recipient.txt'
  try {
    const keys = parseBackupRecipients(await readFile(resolve(path), 'utf8'))
    console.log(`Backup recipients: ${keys.length} age recipient-shaped line(s).`)
  } catch (error) {
    console.error(`Refusing to back up: ${error.message}`)
    process.exitCode = 1
  }
}
