import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'

/** The header every request from the web app carries; the API refuses writes without it. */
const CLIENT = { 'X-RCA-Client': 'web' }
/** How many activity uploads run at once while seeding. */
const SEED_CONCURRENCY = 6
const START_TIMEOUT_MS = 120_000

/** An unused local port, found by listening on port 0 and letting go of it. */
export function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolvePort(port))
    })
  })
}

/**
 * Starts the Worker from `<checkout>/apps/api` with a fresh local database in `state`, the way the e2e
 * worker suite does. It serves the built web app and /api together, and ENVIRONMENT=development turns
 * dev-login on. Creates the git-ignored apps/api/.dev.vars from the example when it is missing.
 */
export async function startWorker({ checkout, state, port }) {
  const api = join(checkout, 'apps', 'api')
  rmSync(state, { recursive: true, force: true })
  if (!existsSync(join(api, '.dev.vars'))) {
    copyFileSync(join(api, '.dev.vars.example'), join(api, '.dev.vars'))
  }
  const wrangler = join(checkout, 'node_modules', '.bin', 'wrangler')
  const env = { ...process.env, CI: '1' }
  const migrate = spawnSync(
    wrangler,
    [
      'd1',
      'migrations',
      'apply',
      'rca',
      '--local',
      '--config',
      'wrangler.local.toml',
      '--persist-to',
      state,
    ],
    { cwd: api, encoding: 'utf8', env },
  )
  if (migrate.status !== 0)
    throw new Error(`migrations failed:\n${migrate.stdout}\n${migrate.stderr}`)
  const child = spawn(
    wrangler,
    [
      'dev',
      '--config',
      'wrangler.local.toml',
      '--port',
      String(port),
      '--inspector-port',
      '0',
      '--persist-to',
      state,
      '--var',
      `APP_URL:http://localhost:${port}`,
      '--show-interactive-dev-session=false',
    ],
    { cwd: api, stdio: ['ignore', 'pipe', 'pipe'], env },
  )
  let output = ''
  child.stdout.on('data', (chunk) => (output += chunk))
  child.stderr.on('data', (chunk) => (output += chunk))
  for (let waited = 0; waited < START_TIMEOUT_MS; waited += 500) {
    if (child.exitCode !== null) throw new Error(`wrangler dev exited:\n${output}`)
    try {
      if ((await fetch(`http://localhost:${port}/api/health`)).ok) return child
    } catch {
      // not listening yet
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500))
  }
  child.kill()
  throw new Error(`wrangler dev did not start:\n${output}`)
}

async function expectOk(response, what) {
  if (response.ok()) return response
  throw new Error(`${what}: ${response.status()} ${(await response.text()).slice(0, 300)}`)
}

/**
 * Signs in through dev-login as `account`, then writes the download's profile, dated measurements and
 * activity digests through the same API the app uses. Returns what was loaded and what the API refused.
 * `request` is a Playwright APIRequestContext, so the session cookie carries over to the browser.
 */
export async function seedAccount({ request, download, account, log }) {
  await expectOk(
    await request.post('/api/auth/dev-login', { headers: CLIENT, data: account }),
    'dev-login',
  )
  const p = download.profile
  await expectOk(
    await request.put('/api/profile', {
      headers: CLIENT,
      data: {
        massKg: p.massKg,
        bikeMassKg: p.bikeMassKg,
        units: p.units,
        keepFiles: false,
        birthYear: p.birthYear,
        sex: p.sex,
      },
    }),
    'profile',
  )
  const measurements = { loaded: 0, refused: [] }
  for (const m of download.measurements ?? []) {
    const data = {
      kind: m.kind,
      value: m.value,
      from: m.from,
      ...(m.sport === undefined ? {} : { sport: m.sport }),
    }
    // The API takes a measurement as a PUT; a POST to this path is a 404.
    const response = await request.put('/api/measurements', { headers: CLIENT, data })
    if (response.ok()) measurements.loaded++
    else {
      measurements.refused.push({
        kind: m.kind,
        status: response.status(),
        body: (await response.text()).slice(0, 200),
      })
    }
  }
  const activities = { total: download.activities.length, loaded: 0, refused: [] }
  const queue = [...download.activities].sort((a, b) => a.startMs - b.startMs)
  async function upload() {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      const fileHash = createHash('sha256').update(`replica:${next.id}`).digest('hex')
      const response = await request.post('/api/activities', {
        headers: CLIENT,
        data: { digest: next.digest, fileName: next.fileName || `${next.id}.fit`, fileHash },
      })
      if (response.ok()) activities.loaded++
      else {
        activities.refused.push({
          sport: next.sport,
          status: response.status(),
          body: (await response.text()).slice(0, 200),
        })
      }
      const done = activities.loaded + activities.refused.length
      if (done % 250 === 0) log(`seeded ${done} of ${activities.total}`)
    }
  }
  await Promise.all(Array.from({ length: SEED_CONCURRENCY }, upload))
  log(
    `seeded: ${activities.loaded} activities loaded, ${activities.refused.length} refused; ${measurements.loaded} measurements`,
  )
  return {
    profile: 'loaded',
    measurements,
    activities,
    unreadableInDownload: download.unreadable ?? 0,
  }
}
