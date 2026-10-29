import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readMarker } from './build-marker.mjs'
import { runGit } from './check-release.mjs'

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
    }
  } catch (error) {
    console.error(`Refusing to deploy: ${error.message}`)
    process.exitCode = 1
  }
}
