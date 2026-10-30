import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { readMarker } from './build-marker.mjs'
import { runGit } from './check-release.mjs'
import { DEFAULT_CONFIG, appUrlFromConfig, runSmoke } from './smoke.mjs'

const RELEASES = new URL('../../docs/RELEASES.md', import.meta.url)

/**
 * Throws unless the checkout is clean, its commit is the tip of origin/main, and the web build in
 * dist was made from exactly that commit; then returns what the deploy records: the full and short
 * commit ids. `allowOlder` deploys an older commit that is on origin/main (a deliberate step back);
 * without it, a newer merge since HEAD is a refusal. A release gate may run in a detached worktree,
 * so the branch name does not matter; the commit does. `git` and `marker` are injectable for tests.
 */
export async function checkDeploySource(
  git = runGit,
  { allowOlder = false, marker = readMarker } = {},
) {
  if ((await git(['status', '--porcelain'])) !== '') {
    throw new Error('The working tree has uncommitted or untracked changes. Commit or remove them.')
  }
  await git(['fetch', '--quiet', 'origin', 'main'])
  const sha = await git(['rev-parse', 'HEAD'])
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Could not read the commit to deploy.')
  try {
    await git(['merge-base', '--is-ancestor', sha, 'refs/remotes/origin/main'])
  } catch {
    throw new Error('HEAD is not a commit on origin/main. Merge it first, or check out main.')
  }
  if (!allowOlder && sha !== (await git(['rev-parse', '--verify', 'refs/remotes/origin/main']))) {
    throw new Error(
      'HEAD is behind the tip of origin/main. Check out the tip, or pass --allow-older to deploy an older merged commit on purpose.',
    )
  }
  const built = await marker()
  if (built.sha !== sha || built.dirty) {
    throw new Error(
      `The web build in dist was not made from a clean checkout of ${sha.slice(0, 8)}. Run npm run build at this commit.`,
    )
  }
  const short = await git(['rev-parse', '--short=8', 'HEAD'])
  return { sha, short }
}

/**
 * The Wrangler arguments for a release: the short commit id as the version tag, a message that names
 * the whole commit, and the commit id inlined into the bundle for /api/health. Nothing secret.
 */
export function deployArguments({ sha, short }) {
  return [
    'deploy',
    '--tag',
    short,
    '--message',
    `Commit ${sha}, local release`,
    '--define',
    `__BUILD_SHA__:"${short}"`,
  ]
}

/** The rollback floor in the newest row of the release ledger, or undefined if it cannot be read. */
export function latestRollbackFloor(ledger) {
  const rows = ledger.slice(ledger.indexOf('\n## Ledger')).split('\n')
  const row = rows.find((line) => /^\| \d{1,2} [A-Z][a-z]{2} \d{4} \|/.test(line))
  const cell = row?.split('|')[5]?.trim()
  return cell && /[0-9a-f]{8}/.test(cell) ? cell : undefined
}

/**
 * What to tell the operator when the post-deploy smoke test fails. The Worker is live and serving
 * what it serves; rolling back is a decision (a migration may make older Workers unsafe), so this
 * names the floor and the command and does not run it.
 */
export function failedSmokeMessage(failures, short, floor) {
  const target = floor
    ? `a version at or above the rollback floor ${floor}`
    : 'a safe earlier version'
  return [
    `Post-deploy smoke test failed for ${short}:`,
    ...failures.map((failure) => `- ${failure}`),
    `The Worker is live. To go back, pick ${target} from docs/RELEASES.md and run:`,
    '  npx wrangler deployments list   (in apps/api, to find the version id)',
    '  npx wrangler rollback <version id> --yes',
    'A rollback restores Worker code only; migrations are never reversed (docs/PRODUCTION.md).',
  ].join('\n')
}

/** Runs the live smoke test against the origin in wrangler.toml; returns the failure lines. */
async function smokeAfterDeploy(short) {
  const appUrl = appUrlFromConfig(await readFile(DEFAULT_CONFIG, 'utf8'))
  return runSmoke({ origin: appUrl, appUrl, expectSha: short })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const source = await checkDeploySource(runGit, {
      allowOlder: process.argv.includes('--allow-older'),
    })
    if (process.argv.includes('--check')) {
      console.log(`Deploy source is clean, built and on origin/main at ${source.short}.`)
    } else {
      console.log(`Deploying ${source.short}.`)
      const result = spawnSync('wrangler', deployArguments(source), { stdio: 'inherit' })
      if (result.error) throw result.error
      process.exitCode = result.status ?? 1
      if (result.status === 0 && !process.argv.includes('--no-smoke')) {
        console.log(`Deployed. Smoke-testing the live origin for ${source.short}.`)
        const failures = await smokeAfterDeploy(source.short)
        if (failures.length) {
          const ledger = await readFile(RELEASES, 'utf8')
          console.error(failedSmokeMessage(failures, source.short, latestRollbackFloor(ledger)))
          process.exitCode = 1
        } else {
          console.log('Post-deploy smoke test passed.')
        }
      }
    }
  } catch (error) {
    console.error(`Refusing to deploy: ${error.message}`)
    process.exitCode = 1
  }
}
