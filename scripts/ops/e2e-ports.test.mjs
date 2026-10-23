import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = (path) => readFile(join(root, path), 'utf8')

// Node before 22.18 cannot import TypeScript without a flag, so the defaults are read from its source.
async function moduleDefaults() {
  const source = await read('apps/web/e2e/ports.ts')
  const defaultPort = (name) => {
    const match = source.match(new RegExp(`^export const ${name} = (\\d+)$`, 'm'))
    assert.ok(match, `${name} is not declared in apps/web/e2e/ports.ts`)
    return Number(match[1])
  }
  return { web: defaultPort('DEFAULT_E2E_WEB_PORT'), api: defaultPort('DEFAULT_E2E_API_PORT') }
}

async function e2eApiScript() {
  const pkg = JSON.parse(await read('apps/api/package.json'))
  return pkg.scripts['e2e:api']
}

test('the e2e ports default to the ones CI has always used', async () => {
  assert.deepEqual(await moduleDefaults(), { web: 4319, api: 8787 })
})

test('the e2e:api script falls back to the module defaults and keeps D1 state per API port', async () => {
  const script = await e2eApiScript()
  const defaults = await moduleDefaults()
  assert.ok(script.includes(`\${E2E_API_PORT:-${defaults.api}}`), 'API port fallback drifted')
  assert.ok(script.includes(`\${E2E_WEB_PORT:-${defaults.web}}`), 'web port fallback drifted')
  assert.ok(script.includes('.wrangler/e2e-state-$P'), 'D1 state is not per API port')
  assert.ok(!script.includes('.wrangler/e2e-state '), 'shared D1 state directory is still used')
})

test('every wrangler flag in e2e:api uses the chosen API port', async () => {
  const script = await e2eApiScript()
  assert.match(script, /--port \$P /, 'wrangler dev does not listen on the chosen API port')
  assert.match(
    script,
    /--persist-to \.wrangler\/e2e-state-\$P --var/,
    'wrangler dev does not read the D1 state for the chosen API port',
  )
  assert.match(script, /--inspector-port 0 /, 'wrangler dev still takes the fixed inspector port')
})

test('the Playwright configs read the e2e ports from the module, not literals', async () => {
  for (const path of ['apps/web/playwright.config.ts', 'apps/web/playwright.worker.config.ts']) {
    assert.doesNotMatch(await read(path), /4319|8787/, `${path} hard-codes an e2e port`)
  }
})

test('the README states both e2e port defaults', async () => {
  const defaults = await moduleDefaults()
  const readme = await read('README.md')
  assert.ok(
    readme.includes(`\`E2E_WEB_PORT\` (default ${defaults.web}`),
    'README does not state the E2E_WEB_PORT default',
  )
  assert.ok(
    readme.includes(`\`E2E_API_PORT\` (default ${defaults.api}`),
    'README does not state the E2E_API_PORT default',
  )
})
