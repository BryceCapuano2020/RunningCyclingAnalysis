import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseBackupRecipients } from './check-backup-recipient.mjs'

const KEY = `age1${'q'.repeat(58)}`

test('accepts a single age public key with comments and blank lines', () => {
  const text = `# owner key, generated offline\n\n${KEY}\n`
  assert.deepEqual(parseBackupRecipients(text), [KEY])
})

test('accepts several recipients', () => {
  assert.equal(parseBackupRecipients(`${KEY}\n${KEY}\n`).length, 2)
})

test('rejects the placeholder shipped in the repository', () => {
  const placeholder = '# comments only\nREPLACE_WITH_AGE_PUBLIC_KEY\n'
  assert.throws(() => parseBackupRecipients(placeholder), /not an age public key/)
})

test('rejects a file with no recipient at all', () => {
  assert.throws(() => parseBackupRecipients('# nothing here\n'), /no age public key/)
})

test('rejects a key with the wrong length or characters', () => {
  assert.throws(() => parseBackupRecipients(`age1${'q'.repeat(57)}\n`), /not an age public key/)
  assert.throws(() => parseBackupRecipients(`age1${'b'.repeat(58)}\n`), /not an age public key/)
})

test('rejects a private key, which must never be stored in the repository', () => {
  const secret = `AGE-SECRET-KEY-1${'Q'.repeat(58)}\n`
  assert.throws(() => parseBackupRecipients(secret), /not an age public key/)
})
