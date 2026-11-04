import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The verdict of the CI result job in .github/workflows/ci.yml, the one required check: it passes
// only when every job it needs passed. A skip passes only where the run means one: the long jobs on a
// documentation-only pull request, and the size job on a push to main. Every other job always runs
// unless the pull request is a draft, which fails here.

/** Jobs a documentation-only pull request skips on purpose. */
export const DOCS_ONLY_SKIPS = ['unit', 'perf', 'sim', 'e2e']

/** The jobs that did not pass, as "job (result)", or ['draft']. Empty means CI result passes. */
export function failures({ needs, draft, code, event }) {
  if (draft === 'true') return ['draft']
  return Object.entries(needs)
    .filter(([job, { result }]) => {
      if (result === 'success') return false
      if (result !== 'skipped') return true
      if (code === 'false' && DOCS_ONLY_SKIPS.includes(job)) return false
      return !(event !== 'pull_request' && job === 'size')
    })
    .map(([job, { result }]) => `${job} (${result})`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const needs = JSON.parse(process.env.NEEDS ?? '{}')
  for (const [job, { result }] of Object.entries(needs)) console.log(`${job}=${result}`)
  const failed = failures({
    needs,
    draft: process.env.DRAFT,
    code: process.env.CODE,
    event: process.env.EVENT,
  })
  if (failed[0] === 'draft') {
    console.log('::error::Draft pull request: CI runs when it is marked ready for review.')
    process.exitCode = 1
  } else if (failed.length) {
    console.log(`::error::Not passed: ${failed.join(', ')}`)
    process.exitCode = 1
  }
}
