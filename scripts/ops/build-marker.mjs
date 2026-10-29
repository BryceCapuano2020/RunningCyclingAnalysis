import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runGit } from './check-release.mjs'

/** The static build's directory, and the file in it that names the commit it was built from. */
export const DIST_DIR = fileURLToPath(new URL('../../apps/web/dist/', import.meta.url))
export const MARKER_FILE = 'build-info.json'

/**
 * What a build records about its source: the full commit id, and whether the tree had uncommitted or
 * untracked changes. A build outside a repository records `unknown`, which a release refuses.
 */
export async function buildMarker(git = runGit) {
  try {
    const sha = await git(['rev-parse', 'HEAD'])
    const dirty = (await git(['status', '--porcelain'])) !== ''
    return { sha, dirty }
  } catch {
    return { sha: 'unknown', dirty: true }
  }
}

/** Reads the marker of a built dist. Throws when there is none or it is not a marker. */
export async function readMarker(dist = DIST_DIR) {
  let text
  try {
    text = await readFile(resolve(dist, MARKER_FILE), 'utf8')
  } catch {
    throw new Error(`${MARKER_FILE} is missing from the web build. Run npm run build first.`)
  }
  const marker = JSON.parse(text)
  if (typeof marker?.sha !== 'string' || typeof marker?.dirty !== 'boolean') {
    throw new Error(`${MARKER_FILE} in the web build is not a build marker. Run npm run build.`)
  }
  return marker
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await mkdir(DIST_DIR, { recursive: true })
  await writeFile(resolve(DIST_DIR, MARKER_FILE), `${JSON.stringify(await buildMarker())}\n`)
}
