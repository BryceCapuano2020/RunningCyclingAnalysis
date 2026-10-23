import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Runs one git command in the current directory and returns its trimmed standard output. */
export async function runGit(args) {
  const { stdout } = await execFileAsync('git', args, { encoding: 'utf8' })
  return stdout.trim()
}

/**
 * Throws unless this checkout is the main branch, has no uncommitted or untracked changes, and
 * matches origin/main. `git` is injectable so the rules can be tested without a repository.
 */
export async function checkRelease(git = runGit) {
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch !== 'main') {
    throw new Error(`Releases must run from main, but this checkout is on "${branch}".`)
  }
  if ((await git(['status', '--porcelain'])) !== '') {
    throw new Error('The working tree has uncommitted or untracked changes. Commit or remove them.')
  }
  await git(['fetch', '--quiet', 'origin', 'main'])
  const head = await git(['rev-parse', 'HEAD'])
  const remote = await git(['rev-parse', '--verify', 'refs/remotes/origin/main'])
  if (head !== remote) {
    throw new Error('HEAD is not origin/main. Push or pull so the release matches the remote.')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await checkRelease()
    console.log('Release checkout is clean main, identical to origin/main.')
  } catch (error) {
    console.error(`Refusing to release: ${error.message}`)
    process.exitCode = 1
  }
}
