import test from 'node:test'
import assert from 'node:assert/strict'
import { checkWorkerSecrets, validateWorkerSecrets } from './check-worker-secrets.mjs'

const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SESSION_SIGNING_KEY']

test('worker secret validation accepts all required secret names without inspecting values', () => {
  const result = validateWorkerSecrets(
    JSON.stringify(required.map((name) => ({ name, type: 'secret_text' }))),
  )
  assert.deepEqual(result, { missing: [] })
})

test('worker secret validation reports only missing names', () => {
  const result = validateWorkerSecrets(JSON.stringify([{ name: 'GOOGLE_CLIENT_ID' }]))
  assert.deepEqual(result, {
    missing: ['GOOGLE_CLIENT_SECRET', 'SESSION_SIGNING_KEY'],
  })
})

test('worker secret validation rejects malformed Wrangler output', () => {
  assert.throws(() => validateWorkerSecrets('not-json'), /unreadable response/)
  assert.throws(() => validateWorkerSecrets('{"secret":"private"}'), /unexpected response/)
})

test('secret check invokes Wrangler with the absolute production config and hides CLI errors', async () => {
  let invocation
  assert.equal(
    await checkWorkerSecrets(async (...args) => {
      invocation = args
      return { stdout: JSON.stringify(required.map((name) => ({ name }))) }
    }),
    required.length,
  )
  assert.equal(invocation[0], 'npx')
  assert.deepEqual(invocation[1].slice(0, 3), ['wrangler', 'secret', 'list'])
  assert.equal(invocation[1][3], '--config')
  assert.ok(invocation[1][4].startsWith('/'))
})

test('secret check does not echo Wrangler failure output', async () => {
  await assert.rejects(
    checkWorkerSecrets(async () => {
      const error = new Error('command failed with SECRET_VALUE')
      error.stderr = 'SECRET_VALUE'
      throw error
    }),
    (error) => {
      assert.match(error.message, /Could not list Worker secret names/)
      assert.doesNotMatch(error.message, /SECRET_VALUE/)
      return true
    },
  )
})
